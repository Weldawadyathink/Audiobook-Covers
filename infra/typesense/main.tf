locals {
  onepassword_vault_id = "xdpqq36uuedlgindu4gaiwdify"
  cloudflare_zone_name = "audiobookcovers.com"
  typesense_hostname   = "typesense.audiobookcovers.com"
  tailscale_tags       = ["tag:server"]
  digitalocean_token = one(flatten([
    for section in data.onepassword_item.digitalocean.section : [
      for field in section.field : field.value
      if field.label == "token"
    ]
  ]))
}

data "onepassword_item" "digitalocean" {
  vault = local.onepassword_vault_id
  uuid  = "r6tbyrvvzrdifgr3745qz2x2uq"
}

data "onepassword_item" "cloudflare" {
  vault = local.onepassword_vault_id
  uuid  = "rlhstmgoi7cs5bwxnsknribgsu"
}

data "onepassword_item" "typesense" {
  vault = local.onepassword_vault_id
  uuid  = "rvzbqswzbr5raj6lpslyokznj4"
}

data "onepassword_item" "tailscale" {
  vault = local.onepassword_vault_id
  uuid  = "xdghxnc2ekcvxx5gaogqaxsp3a"
}

data "cloudflare_zone" "audiobookcovers" {
  filter = {
    account = {
      id = data.onepassword_item.cloudflare.username
    }
    name = local.cloudflare_zone_name
  }
}

data "http" "cloudflare_ips" {
  url = "https://api.cloudflare.com/client/v4/ips"

  request_headers = {
    Accept = "application/json"
  }
}

locals {
  cloudflare_ips              = jsondecode(data.http.cloudflare_ips.response_body).result
  cloudflare_source_addresses = concat(local.cloudflare_ips.ipv4_cidrs, local.cloudflare_ips.ipv6_cidrs)
  droplet_tags                = ["audiobook-covers", "typesense"]
  tailscale_tags_arg          = "--advertise-tags=${join(",", local.tailscale_tags)}"
}

resource "tls_private_key" "origin" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_cert_request" "origin" {
  private_key_pem = tls_private_key.origin.private_key_pem

  subject {
    common_name  = local.typesense_hostname
    organization = "Audiobook Covers"
  }

  dns_names = [local.typesense_hostname]
}

resource "cloudflare_origin_ca_certificate" "typesense" {
  csr                = tls_cert_request.origin.cert_request_pem
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
  tags                = local.tailscale_tags
  description         = "Audiobook Covers Typesense Droplet"
}

resource "digitalocean_droplet" "typesense" {
  name       = var.droplet_name
  image      = var.droplet_image
  region     = var.region
  size       = var.droplet_size
  backups    = true
  monitoring = true
  ipv6       = true
  tags       = local.droplet_tags
  ssh_keys   = var.ssh_keys

  backup_policy {
    plan    = "weekly"
    weekday = var.backup_weekday
    hour    = var.backup_hour
  }

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    origin_certificate_pem_b64 = base64encode(cloudflare_origin_ca_certificate.typesense.certificate)
    origin_private_key_pem_b64 = base64encode(tls_private_key.origin.private_key_pem)
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
    tailscale_tags_arg = local.tailscale_tags_arg
    droplet_name       = var.droplet_name
    typesense_version  = var.typesense_version
  })

  lifecycle {
    ignore_changes = [user_data]
  }
}

resource "digitalocean_firewall" "typesense" {
  name        = "${var.droplet_name}-firewall"
  droplet_ids = [digitalocean_droplet.typesense.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = local.cloudflare_source_addresses
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
