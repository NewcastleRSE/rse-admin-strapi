variable "resource_group_name" {
  default = "rseadmin"
}

variable "resource_group_location" {
  default = "uksouth"
}

variable "project_name" {
  type = string
  default = "RSE Admin"
}

variable "project_pi" {
  type = string
  default = "Mark Turner"
}

variable "project_contributors" {
  type = string
  default = "Mark Turner"
}

variable "app_keys" {
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  type        = string
  sensitive   = true
}

variable "api_token_salt" {
  type        = string
  sensitive   = true
}

variable "database_host" {
  type        = string
  sensitive   = true
}

variable "database_port" {
  type        = string
  sensitive   = true
}

variable "database_name" {
  type        = string
  sensitive   = true
}

variable "database_username" {
  type        = string
  sensitive   = true
}

variable "database_password" {
  type        = string
  sensitive   = true
}

variable "database_ssl" {
  type        = string
  sensitive   = true
}

variable "hubspot_key" {
  type        = string
  sensitive   = true
}

variable "clockify_key" {
  type        = string
  sensitive   = true
}

variable "clockify_workspace" {
  type        = string
  sensitive   = true
}