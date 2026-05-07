locals {
  typesense_hostname                 = "typesense.audiobookcovers.com"
  typesense_tailscale_tags           = ["tag:server"]
  typesense_tailscale_arg            = "--advertise-tags=${join(",", local.typesense_tailscale_tags)}"
  typesense_droplet_tags             = ["audiobook-covers", "typesense"]
  typesense_root_ssh_key             = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICIWGqUhso7mS8EVY+x0T61Cp5j89Qsq6TQWKf2yKeMC"
  typesense_root_ssh_key_fingerprint = "33:0e:fb:da:66:54:33:d5:e3:43:f8:1b:71:16:10:3c"
}

resource "tls_private_key" "typesense_origin" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_cert_request" "typesense_origin" {
  private_key_pem = tls_private_key.typesense_origin.private_key_pem

  subject {
    common_name  = local.typesense_hostname
    organization = "Audiobook Covers"
  }

  dns_names = [local.typesense_hostname]
}

resource "cloudflare_origin_ca_certificate" "typesense" {
  csr                = tls_cert_request.typesense_origin.cert_request_pem
  hostnames          = [local.typesense_hostname]
  request_type       = "origin-ecc"
  requested_validity = 5475
}

resource "tailscale_tailnet_key" "typesense" {
  reusable            = false
  ephemeral           = false
  preauthorized       = true
  expiry              = 3600
  recreate_if_invalid = "always"
  tags                = local.typesense_tailscale_tags
  description         = "Audiobook Covers Typesense Droplet"
}

resource "digitalocean_droplet" "typesense" {
  name          = var.typesense_droplet_name
  image         = var.typesense_droplet_image
  region        = var.digitalocean_region
  size          = var.typesense_droplet_size
  backups       = true
  monitoring    = true
  droplet_agent = true
  ipv6          = true
  tags          = local.typesense_droplet_tags
  ssh_keys      = distinct(concat(var.typesense_ssh_keys, [local.typesense_root_ssh_key_fingerprint]))

  backup_policy {
    plan    = "weekly"
    weekday = var.typesense_backup_weekday
    hour    = var.typesense_backup_hour
  }

  user_data = templatefile("${path.module}/templates/typesense-cloud-init.yaml.tftpl", {
    origin_certificate_pem_b64 = base64encode(cloudflare_origin_ca_certificate.typesense.certificate)
    origin_private_key_pem_b64 = base64encode(tls_private_key.typesense_origin.private_key_pem)
    typesense_config_b64 = base64encode(<<-EOT
      api-address = 0.0.0.0
      api-port = 443
      data-dir = /var/lib/typesense
      api-key = ${data.onepassword_item.typesense.password}
      ssl-certificate = /etc/typesense/cloudflare-origin.pem
      ssl-certificate-key = /etc/typesense/cloudflare-origin.key
    EOT
    )
    systemd_override_b64 = base64encode(<<-EOT
      [Service]
      AmbientCapabilities=CAP_NET_BIND_SERVICE
      CapabilityBoundingSet=CAP_NET_BIND_SERVICE
    EOT
    )
    tailscale_auth_key = tailscale_tailnet_key.typesense.key
    tailscale_tags_arg = local.typesense_tailscale_arg
    droplet_name       = var.typesense_droplet_name
    typesense_version  = var.typesense_version
    root_username_b64  = base64encode(data.onepassword_item.typesense_root.username)
    root_password_b64  = base64encode(data.onepassword_item.typesense_root.password)
    root_ssh_key_b64   = base64encode(local.typesense_root_ssh_key)
  })
}

resource "digitalocean_firewall" "typesense" {
  name        = "${var.typesense_droplet_name}-firewall"
  droplet_ids = [digitalocean_droplet.typesense.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = local.cloudflare_source_addresses
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

resource "cloudflare_dns_record" "typesense" {
  zone_id = data.cloudflare_zone.audiobookcovers.id
  name    = local.typesense_hostname
  type    = "A"
  content = digitalocean_droplet.typesense.ipv4_address
  proxied = true
  ttl     = 1
  comment = "Typesense origin managed by Terraform"
}
