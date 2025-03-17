import { MODEL } from "@/config/constants";
import OpenAI from "openai";
import pdfParse from 'pdf-parse';

const openai = new OpenAI();

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

export async function POST(request: Request) {
  const { fileObject } = await request.json();

  try {
    const fileBuffer = Buffer.from(fileObject.content, "base64");

    // If PDF, transform to JSON
    if (fileObject.name.toLowerCase().endsWith('.pdf')) {
      const pdfText = await extractPdfText(fileBuffer);
      console.log("PDF text extracted:", pdfText);
      const menuData = await openai.responses.create(
        {
          model: MODEL,
          input: [
            { "role": "system", "content": "You are an expert data extractor. When given raw text from a PDF, you must extract the required data and output only valid JSON that strictly adheres to the provided schema." },
            { "role": "user", "content": `Raw Text: """${pdfText}"""` }
          ],
          text: {
            "format": {
              "type": "json_schema", 
              "name": "menu_items", 
              "schema": { 
                "type": "object",
                "properties": { 
                  "menu_items": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": { 
                        "category": { "type": "string" }, 
                        "name": { "type": "string" }, 
                        "price": { "type": "string" }, 
                        "currency": { "type": "string" },
                        // Optional keys allow null
                        "size": { "type": ["string", "null"] },
                        "ingredients": { "type": ["array", "null"], "items": { "type": "string" } }, 
                        "allergens": { "type": ["array", "null"], "items": { "type": "string" } }
                      },
                      "required": ["category", "name", "price", "currency", "size", "ingredients", "allergens"],
                      "additionalProperties": false,
                    }
                  }
                },
                "required": ["menu_items"],
                "additionalProperties": false,
              },
              "strict": true,
            }
          }
        });

      // Create new JSON file from transformed data
      const jsonContent = JSON.stringify(menuData.output_text, null, 2);
      const jsonBuffer = Buffer.from(jsonContent);
      const jsonBlob = new Blob([jsonBuffer], { type: "application/json" });
      const newFileName = fileObject.name.replace('.pdf', '.json');

      const file = await openai.files.create({
        file: new File([jsonBlob], newFileName),
        purpose: "assistants",
      });

      console.log("JSON file created:", jsonContent);
      return new Response(JSON.stringify(file), { status: 200 });
    }

    // For non-PDF files, proceed as normal
    const fileBlob = new Blob([fileBuffer], {
      type: "application/octet-stream",
    });

    const file = await openai.files.create({
      file: new File([fileBlob], fileObject.name),
      purpose: "assistants",
    });

    return new Response(JSON.stringify(file), { status: 200 });
  } catch (error) {
    console.error("Error uploading file:", error);
    return new Response("Error uploading file", { status: 500 });
  }
}
