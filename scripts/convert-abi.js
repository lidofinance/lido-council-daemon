const fs = require('fs').promises;
const path = require('path');
const { ethers } = require('ethers');

// Paths for the input and output directories
const inputDir = './src/abi-human-readable';
const outputDir = './src/abi';

async function convertAbis(inputDir, outputDir) {
  try {
    // Ensure the output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Read all files in the input directory
    const files = await fs.readdir(inputDir);

    for (let file of files) {
      // Process only .json files
      if (path.extname(file) === '.json') {
        const filePath = path.join(inputDir, file);

        try {
          // Read and parse the file
          const data = await fs.readFile(filePath, 'utf8');
          const humanReadableAbi = JSON.parse(data);
          const iface = new ethers.utils.Interface(humanReadableAbi);
          const jsonAbi = iface.format(ethers.utils.FormatTypes.json);

          // Save the converted ABI to the output directory with the same filename
          const outputFilePath = path.join(outputDir, file);
          await fs.writeFile(outputFilePath, jsonAbi);
          console.log(`Processed and saved: ${file}`);
        } catch (error) {
          console.error(`Error processing file ${file}:`, error);
        }
      }
    }
  } catch (err) {
    console.error("Error setting up directories or reading files:", err);
  }
}

// Call the function with the designated input and output directories
convertAbis(inputDir, outputDir);
