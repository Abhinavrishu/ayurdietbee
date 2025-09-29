import "dotenv/config";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { createClient } from "@supabase/supabase-js";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import  {HfInference } from "@huggingface/inference";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const hf = new HfInference(
 process.env.HF_API_KEY
);

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

async function indexPDF() {
  const PDF_PATH = path.join(process.cwd(), "ayurveda.pdf");
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ Error: File '${PDF_PATH}' not found.`);
    return;
  }

  const dataBuffer = fs.readFileSync(PDF_PATH);
  const pdfData = await pdfParse(dataBuffer);
  const fullText = pdfData.text;
  console.log("PDF text length:", fullText.length);

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  const chunkedDocs = await textSplitter.splitText(fullText);

  const filteredDocs = chunkedDocs.filter((chunk) => {
    if (chunk.trim().length < 50) return false;
    const metadataKeywords = [
      "ISSN:", "DOI:", "Published online:", "To link to this article:",
      "Journal homepage:", "Singh et al.", "www.", "Fig", "TABLE",
      "References", "Acknowledgments", "Disclosure",
    ];
    return !metadataKeywords.some((kw) => chunk.includes(kw));
  });

  console.log("Filtered chunks:", filteredDocs.length);

  const batches = chunkArray(filteredDocs, 50);
  const allEmbeddings = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`✨ Processing batch ${i + 1} of ${batches.length}...`);

    for (const content of batch) {
      try {
        const embedding = await hf.featureExtraction({
          model: "sentence-transformers/all-mpnet-base-v2",
          inputs: content,
        });
        allEmbeddings.push(embedding);
      } catch (err) {
        console.error("❌ Error generating embedding:", err);
      }
    }
  }

  for (let i = 0; i < filteredDocs.length; i++) {
    const content = filteredDocs[i];
    const embeddingVector = allEmbeddings[i];

    const { error } = await supabaseAdmin.from("ayur_docs").insert([
      {
        title: `Chunk ${i + 1}`,
        chunk_index: i,
        content,
        embedding: embeddingVector,
      },
    ]);

    if (error) {
      console.error(`❌ Error saving chunk ${i}:`, error);
    } else {
      console.log(`✅ Chunk ${i} saved successfully`);
    }
  }

  console.log("✅ All chunks indexed!");
}

indexPDF().catch((err) => console.error("Fatal error indexing PDF:", err));
