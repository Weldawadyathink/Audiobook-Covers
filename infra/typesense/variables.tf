variable "droplet_name" {
  description = "DigitalOcean Droplet name and Tailscale hostname."
  type        = string
  default     = "audiobook-covers-typesense"
}

variable "region" {
  description = "DigitalOcean region slug."
  type        = string
  default     = "sfo3"
}

variable "droplet_size" {
  description = "DigitalOcean Droplet size slug."
  type        = string
  default     = "s-1vcpu-1gb"
}

variable "droplet_image" {
  description = "DigitalOcean Droplet image slug."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "typesense_version" {
  description = "Typesense server version to install from the official release packages."
  type        = string
  default     = "29.0"
}

variable "backup_weekday" {
  description = "Weekday for the DigitalOcean weekly Droplet backup window."
  type        = string
  default     = "SUN"

  validation {
    condition     = contains(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], var.backup_weekday)
    error_message = "backup_weekday must be one of SUN, MON, TUE, WED, THU, FRI, SAT."
  }
}

variable "backup_hour" {
  description = "UTC hour for the DigitalOcean backup window. DigitalOcean supports 0, 4, 8, 12, 16, or 20."
  type        = number
  default     = 8

  validation {
    condition     = contains([0, 4, 8, 12, 16, 20], var.backup_hour)
    error_message = "backup_hour must be one of 0, 4, 8, 12, 16, or 20."
  }
}

variable "ssh_keys" {
  description = "Optional DigitalOcean SSH key IDs or fingerprints to inject. Public SSH ingress remains blocked."
  type        = list(string)
  default     = []
}
