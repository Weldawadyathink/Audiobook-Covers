variable "typesense_droplet_name" {
  description = "DigitalOcean Droplet name and Tailscale hostname for the Typesense service."
  type        = string
  default     = "audiobook-covers-typesense"
}

variable "digitalocean_region" {
  description = "DigitalOcean region slug."
  type        = string
  default     = "sfo3"
}

variable "typesense_droplet_size" {
  description = "DigitalOcean Droplet size slug for the Typesense service."
  type        = string
  default     = "s-1vcpu-1gb"
}

variable "typesense_droplet_image" {
  description = "DigitalOcean Droplet image slug for the Typesense service."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "typesense_version" {
  description = "Typesense server version to install from the official release packages."
  type        = string
  default     = "29.0"
}

variable "typesense_backup_weekday" {
  description = "Weekday for the DigitalOcean weekly Droplet backup window."
  type        = string
  default     = "SUN"

  validation {
    condition     = contains(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], var.typesense_backup_weekday)
    error_message = "typesense_backup_weekday must be one of SUN, MON, TUE, WED, THU, FRI, SAT."
  }
}

variable "typesense_backup_hour" {
  description = "UTC hour for the DigitalOcean backup window. DigitalOcean supports 0, 4, 8, 12, 16, or 20."
  type        = number
  default     = 8

  validation {
    condition     = contains([0, 4, 8, 12, 16, 20], var.typesense_backup_hour)
    error_message = "typesense_backup_hour must be one of 0, 4, 8, 12, 16, or 20."
  }
}

variable "typesense_ssh_keys" {
  description = "Optional additional DigitalOcean SSH key IDs or fingerprints to inject."
  type        = list(string)
  default     = []
}
