#!/bin/bash

# Create placeholder hero images for each page
# These should be replaced with actual images from Google Drive

HERO_DIR="/Users/damilola/Documents/Projects/alocubano.boulderfest/images/hero"
DEFAULT_HERO="/Users/damilola/Documents/Projects/alocubano.boulderfest/images/hero/hero-default.jpg"

# Pages that need hero images
PAGES=("home" "about" "artists" "schedule" "gallery" "gallery-2025" "tickets" "donations" "contact")

echo "Creating placeholder hero images..."

for page in "${PAGES[@]}"; do
    target_file="${HERO_DIR}/${page}.jpg"
    if [ ! -f "$target_file" ]; then
        echo "Creating placeholder for ${page}.jpg"
        cp "$DEFAULT_HERO" "$target_file"
    else
        echo "Hero image for ${page}.jpg already exists"
    fi
done

echo "Placeholder hero images created!"
echo "Replace these files with actual images from Google Drive:"
for page in "${PAGES[@]}"; do
    echo "  - ${HERO_DIR}/${page}.jpg"
done