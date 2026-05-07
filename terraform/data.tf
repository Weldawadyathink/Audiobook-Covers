locals {
  onepassword_vault_id = "xdpqq36uuedlgindu4gaiwdify"
  cloudflare_zone_name = "audiobookcovers.com"
}

data "onepassword_item" "digitalocean" {
  vault = local.onepassword_vault_id
  uuid  = "c762p4jttpfw5oyal3dpjuvhqq"
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
  digitalocean_token          = data.onepassword_item.digitalocean.password
  cloudflare_ips              = jsondecode(data.http.cloudflare_ips.response_body).result
  cloudflare_source_addresses = concat(local.cloudflare_ips.ipv4_cidrs, local.cloudflare_ips.ipv6_cidrs)
}
