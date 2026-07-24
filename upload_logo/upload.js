import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

async function uploadAudio(filename) {
  const filePath = path.join(__dirname, "audio", filename);

  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return;
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", fs.createReadStream(filePath), {
    filename,
    contentType: "audio/ogg",
  });

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/media`,
      form,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          ...form.getHeaders(),
        },
      }
    );

    console.log(`\n✅ ${filename}`);
    console.log(`Media ID: ${response.data.id}`);
  } catch (error) {
    console.error(`\n❌ Failed to upload ${filename}`);
    console.error(
      error.response?.data || error.message
    );
  }
}

async function main() {
  await uploadAudio("en_opus.ogg");
await uploadAudio("enr_opus.ogg");
}

main();