output "typesense_url" {
  description = "Cloudflare-proxied Typesense URL."
  value       = "https://${local.typesense_hostname}"
}

output "droplet_ipv4_address" {
  description = "DigitalOcean public IPv4 address. Inbound HTTPS is restricted to Cloudflare IP ranges."
  value       = digitalocean_droplet.typesense.ipv4_address
}

output "droplet_ipv6_address" {
  description = "DigitalOcean public IPv6 address."
  value       = digitalocean_droplet.typesense.ipv6_address
}

output "tailscale_ssh_command" {
  description = "Expected Tailscale SSH command after the node joins the tailnet and ACLs allow access."
  value       = "tailscale ssh root@${var.droplet_name}"
}
