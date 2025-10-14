locals {
  env = terraform.workspace == "production" ? "" : "-dev"
}

variable "resource_group_name" {
  type = string
  default = "rseadmin"
}

variable "resource_group_location" {
  type = string
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
  default = "Mark Turner, Kate Court, Rebecca Osselton"
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

variable "database_username" {
  type        = string
  sensitive   = true
}

variable "database_password" {
  type        = string
  sensitive   = true
}

variable "database_cert" {
  type        = string
  sensitive   = true
}

variable "hubspot_key" {
  type        = string
  sensitive   = true
}

variable "hubspot_access_token" {
  type        = string
  sensitive   = true
}

variable "hubspot_client_secret" {
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

variable "leave_api_token" {
  type        = string
  sensitive   = true
}

variable "transactions_sheet" {
  type        = string
  default     = "Transactions_All_Time"
}

variable "transactions_header" {
  type        = string
  default     = "null,CO_Object_Name,WBS_element,Cost_Elem.,Cost_element_descr.,RefDocNo,Document_Header_Text,Name,Year,frm,Doc._Date,Postg_Date,Val/COArea_Crcy,BW_Category,I/E"
}