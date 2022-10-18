# We strongly recommend using the required_providers block to set the
# Azure Provider source and version being used
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "=3.27.0"
    }
  }
}

# Configure the Microsoft Azure Provider
provider "azurerm" {
  features {}
  subscription_id = "e7cbfebb-f482-46c4-a90b-126855b03325"
}

locals {
  resource_group_name = terraform.workspace == "production" ? var.resource_group_name : join("", [var.resource_group_name, "staging"])
}

resource "azurerm_resource_group" "rg" {
  name = local.resource_group_name
  location = var.resource_group_location
  tags = {
    Name = var.project_name
    PI = var.project_pi
    Contributors = var.project_contributors
  }
}

resource "azurerm_storage_account" "storage" {
  name                      = local.resource_group_name
  resource_group_name       = azurerm_resource_group.rg.name
  location                  = azurerm_resource_group.rg.location
  account_tier              = "Standard"
  account_replication_type  = "LRS"
  enable_https_traffic_only = true

  static_website {
    index_document     = "index.html"
    error_404_document = "index.html"
  }
}

resource "azurerm_container_registry" "acr" {
  name                = local.resource_group_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Standard"
  admin_enabled       = true
  tags = {
    Name = var.project_name
    PI = var.project_pi
    Contributors = var.project_contributors
  }
}

resource "azurerm_mysql_flexible_server" "mysql" {
  name                   = local.resource_group_name
  resource_group_name    = azurerm_resource_group.rg.name
  location               = azurerm_resource_group.rg.location
  administrator_login    = var.database_username
  administrator_password = var.database_password
  backup_retention_days  = 7
  sku_name               = "B_Standard_B1s"

  tags = {
    Name = var.project_name
    PI = var.project_pi
    Contributors = var.project_contributors
  }
}

resource "azurerm_mysql_flexible_database" "database" {
  name                = azurerm_resource_group.rg.name
  resource_group_name = azurerm_resource_group.rg.name
  server_name         = azurerm_mysql_flexible_server.mysql.name
  charset             = "utf8"
  collation           = "utf8_unicode_ci"
}

resource "azurerm_service_plan" "asp" {
  name                = "rseadmin-plan"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  os_type             = "Linux"
  sku_name            = "B1"

  tags = {
    Name = var.project_name
    PI = var.project_pi
    Contributors = var.project_contributors
  }
}

resource "azurerm_linux_web_app" "as" {
  name                = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  service_plan_id     = azurerm_service_plan.asp.id
  https_only          = "true"

  # site_config {
  #   scm_type  = "VSTSRM"
  #   always_on = "true"
  #   linux_fx_version  = join("|", ["DOCKER", join("/", [azurerm_container_registry.acr.login_server, "api:latest"])])
  #   health_check_path = "/health" # health check required in order that internal app service plan loadbalancer do not loadbalance on instance down
  # }
  site_config {
    application_stack {
      docker_image      = "${azurerm_container_registry.acr.login_server}/api"
      docker_image_tag  = "latest"
    }
  }

  identity {
    type = "SystemAssigned"
  }

  app_settings = {
    HOST = "0.0.0.0"
    PORT = "8080"
    APP_KEYS = var.app_keys
    JWT_SECRET = var.hubspot_key
    API_TOKEN_SALT = var.api_token_salt
    DATABASE_HOST = azurerm_mysql_flexible_server.mysql.fqdn
    DATABASE_PORT = "3306"
    DATABASE_NAME = azurerm_resource_group.rg.name
    DATABASE_USERNAME = var.database_username
    DATABASE_PASSWORD = var.database_password
    DATABASE_SSL = "true"
    SENTRY_DSN = "https://61fabb3453014b8d8d4a3181de8314eb@o1080315.ingest.sentry.io/6118106"
    PUBLIC_URL = "https://${azurerm_resource_group.rg.name}.azurewebsites.net/"
    PUBLIC_ADMIN_URL = "https://${azurerm_resource_group.rg.name}.azurewebsites.net/dashboard"
    HUBSPOT_KEY = var.hubspot_key 
    HUBSPOT_DEAL_PROPERTIES = "amount,dealname,dealstage,last_activity_date,account_code,award_stage,end_date,faculty,finance_contact,funding_body,project_lead,project_value,school,start_date,status,cost_model"
    HUBSPOT_DEAL_ASSOCIATIONS = "contacts,companies"
    HUBSPOT_DEAL_MEETING_SCHEDULED = "appointmentscheduled"
    HUBSPOT_DEAL_BID_PREPARATION = "presentationscheduled"
    HUBSPOT_DEAL_GRANT_WRITING = "decisionmakerboughtin"
    HUBSPOT_DEAL_SUBMITTED_TO_FUNDER = "contractsent"
    HUBSPOT_DEAL_FUNDED_AWAITING_ALLOCATION = "closedwon"
    HUBSPOT_DEAL_NOT_FUNDED = "closedlost"
    HUBSPOT_DEAL_ALLOCATED = "0fd81f66-7cda-4db7-b2e8-b0114be90ef9"
    HUBSPOT_DEAL_COMPLETED = "09b510b5-6871-4771-ad09-1438ce8e6f11"
    HUBSPOT_CONTACT_PROPERTIES = "firstname,lastname,email,department,jobtitle"
    CLOCKIFY_KEY = var.clockify_key
    CLOCKIFY_WORKSPACE = var.clockify_workspace
    WEBSITES_ENABLE_APP_SERVICE_STORAGE = "true"
    DOCKER_REGISTRY_SERVER_USERNAME = azurerm_container_registry.acr.admin_username
    DOCKER_REGISTRY_SERVER_PASSWORD = azurerm_container_registry.acr.admin_password
    DOCKER_REGISTRY_SERVER_URL = azurerm_container_registry.acr.login_server
    TRANSACTIONS_SHEET = var.transactions_sheet
    TRANSACTIONS_HEADER = var.transactions_header
  }

  tags = {
    Name = var.project_name
    PI = var.project_pi
    Contributors = var.project_contributors
  }
}