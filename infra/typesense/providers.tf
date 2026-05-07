provider "cloudflare" {
  api_token = data.onepassword_item.cloudflare.credential
}

provider "digitalocean" {
  token = local.digitalocean_token
}

provider "onepassword" {}

provider "tailscale" {
  api_key = data.onepassword_item.tailscale.credential
  tailnet = "-"
}
