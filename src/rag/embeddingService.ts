import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function generateEmbedding(
  text: string, 
  taskType: TaskType = TaskType.RETRIEVAL_QUERY
): Promise<number[]> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    const result = await model.embedContent({
      content: { 
        role: "user", 
        parts: [{ text }] 
      },
      taskType: taskType,
      // title is optional but helpful for Document tasks
      ...(taskType === TaskType.RETRIEVAL_DOCUMENT && { title: "Knowledge Base Chunk" })
    });

    return result.embedding.values;
  } catch (error) {
    console.error("❌ Embedding Error:", error);
    throw error;
  }
}
