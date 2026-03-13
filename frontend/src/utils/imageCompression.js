/**
 * Compress an image file to reduce file size for storage and transmission
 * @param {File} file - The image file to compress
 * @param {number} maxWidth - Maximum width in pixels (default: 640)
 * @param {number} maxHeight - Maximum height in pixels (default: 640)
 * @param {number} quality - JPEG quality 0-1 (default: 0.7)
 * @returns {Promise<string>} Base64 data URL of compressed image
 */
export function compressImage(
    file,
    maxWidth = 640,
    maxHeight = 640,
    quality = 0.7
) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions while maintaining aspect ratio
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                // Create canvas and draw resized image
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to compressed JPEG
                const compressedDataUrl = canvas.toDataURL(
                    "image/jpeg",
                    quality
                );
                resolve(compressedDataUrl);
            };

            img.onerror = () => {
                reject(new Error("Failed to load image"));
            };

            img.src = event.target.result;
        };

        reader.onerror = () => {
            reject(new Error("Failed to read file"));
        };

        reader.readAsDataURL(file);
    });
}

/**
 * Get the approximate size of a base64 string in bytes
 * @param {string} base64String - The base64 string
 * @returns {number} Approximate size in bytes
 */
export function getBase64Size(base64String) {
    // Account for base64 encoding overhead (~33% larger than binary)
    return Math.ceil((base64String.length * 3) / 4);
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
export function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
