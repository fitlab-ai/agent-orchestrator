#!/bin/sh
set -e

echo "UTF-8 check script is running..."

# Iterate over every file that is in the staging area
for FILE in $(git diff --cached --name-only); do
    # If file exists
    # shellcheck disable=SC2039
    if [[ -e "$FILE" ]]; then
        if [[ $(file -bi "$FILE") != *"charset=binary"* ]]; then
            # Get file encoding
            encoding=$(file -bi "$FILE" | sed -e 's/.*[ ]charset=//')
            echo "Checking file $FILE (encoding: $encoding)"

            # If encoding is not utf-8 or us-ascii, exit with failure status
            if ! echo "$encoding" | grep -q -e 'utf-8' -e 'us-ascii'; then
                echo "Error: File $FILE is not UTF-8 encoded or US-ASCII, it is $encoding. Please convert it to UTF-8."
                exit 1
            fi
        fi
    fi
done

echo "UTF-8 check completed successfully."
