# Terraform

Most Terraform configuration for the project lives in this directory. The repo
root keeps a small `terraform.tf` entrypoint with the backend and local module.

Run Terraform from the repo root:

```sh
task infra:plan
terraform plan
```

State is stored in the shared Cloudflare R2 bucket `terraform` at:

```text
audiobook-covers/terraform.tfstate
```

The backend expects R2 credentials in the standard AWS environment variables:

```sh
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

The R2 endpoint is configured in `terraform.tf`.
