terraform {
  required_version = ">= 1.6.0"

  backend "s3" {
    bucket = "terraform"
    key    = "audiobook-covers/terraform.tfstate"
    region = "auto"

    endpoints = {
      s3 = "https://57d01014eca6e2153041393f3114dc60.r2.cloudflarestorage.com"
    }

    use_lockfile = true

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

module "audiobook_covers" {
  source = "./terraform"
}

output "typesense_url" {
  description = "Cloudflare-proxied Typesense URL."
  value       = module.audiobook_covers.typesense_url
}

output "typesense_droplet_ipv4_address" {
  description = "DigitalOcean public IPv4 address. Inbound HTTPS is restricted to Cloudflare IP ranges."
  value       = module.audiobook_covers.typesense_droplet_ipv4_address
}

output "typesense_droplet_ipv6_address" {
  description = "DigitalOcean public IPv6 address."
  value       = module.audiobook_covers.typesense_droplet_ipv6_address
}

output "typesense_tailscale_ssh_command" {
  description = "Expected Tailscale SSH command after the node joins the tailnet and ACLs allow access."
  value       = module.audiobook_covers.typesense_tailscale_ssh_command
}
