# Typesense Infrastructure

Terraform for a single-node Typesense server on DigitalOcean.

Terraform reads infrastructure secrets from 1Password using the 1Password
Terraform provider. The Taskfile injects `OP_SERVICE_ACCOUNT_TOKEN` from:

```sh
op://xdpqq36uuedlgindu4gaiwdify/okjnwzitpx5x5u6xnyx2qd2ycq/credential
```

## What It Creates

- One Ubuntu 24.04 DigitalOcean Droplet using `s-1vcpu-1gb`.
- Typesense installed directly on the Droplet, listening on HTTPS port `443`.
- Local disk Typesense data at `/var/lib/typesense`.
- DigitalOcean weekly Droplet backups.
- A Cloudflare Origin CA certificate installed on the Droplet.
- A proxied Cloudflare `A` record for the Typesense hostname.
- A DigitalOcean firewall that allows inbound `443/tcp` only from Cloudflare IP ranges.
- A short-lived, single-use Tailscale auth key tagged with `tag:server`.
- Tailscale with Tailscale SSH enabled. Public SSH ingress is not opened.

## Setup

Copy the example variables and fill in real values:

```sh
cp infra/typesense/terraform.tfvars.example infra/typesense/terraform.tfvars
```

DigitalOcean, Cloudflare, Tailscale, and Typesense credentials are read from
1Password. Local tfvars are only needed if you want to override non-secret
defaults such as region or backup window.

Then run Terraform through the repo Taskfile:

```sh
task infra:typesense:init
task infra:typesense:plan
task infra:typesense:apply
```

The Cloudflare zone should be configured for `Full (strict)` SSL mode.

## Verification

After apply:

```sh
curl https://<typesense-hostname>/health
tailscale ssh root@audiobook-covers-typesense
```

Confirm weekly backups are enabled in the DigitalOcean control panel.
