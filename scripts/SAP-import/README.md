# SAP Import 

Simple script to turn the spreadsheet of doom into an array of assignment objects for use in strapi. 

## Required JSON files

1. JSON version the SAP spreadsheet. Export the file csv and use an online conversion tool.
2. Export of all projects in strapi
3. Export of all RSEs in strapi

## Output

The script creates a new JSON file called `assignments`. This file can then be easily imported into Strapi.