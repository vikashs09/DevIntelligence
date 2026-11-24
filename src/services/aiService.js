import OpenAI from "openai";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL:
    process.env.OPENROUTER_BASE_URL ||
    "https://openrouter.ai/api/v1",
});

export async function askDeepSeek({
  question,
  context = {},
  conversation = [],
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is missing in backend/.env"
    );
  }

  console.log("AI Request:", question);
  console.log(
    "OpenRouter Model:",
    process.env.OPENROUTER_MODEL || "openrouter/free"
  );

  const messages = [
    {
      role: "system",
      content: `
You are Dev Intelligence AI.

You are an intelligent project-management assistant.

Use ONLY the real project information provided in the context.

Never invent:
- tasks
- users
- repositories
- pull requests
- issues
- health scores
- project statistics
- team information

If information is unavailable, clearly say that it is unavailable.

Give practical, concise and useful answers.
When making a factual claim, cite the exact task key, repository name, PR number, or date available in the context. Separate observed facts from recommendations. Never invent URLs or claim that an action was executed.

When analyzing project health:
- explain the actual factors
- use the provided project data
- clearly separate facts from recommendations

PROJECT CONTEXT:
${JSON.stringify(context, null, 2)}
`,
    },

    ...(Array.isArray(conversation)
      ? conversation
          .filter(
            (message) =>
              message &&
              ["user", "assistant"].includes(message.role) &&
              typeof message.content === "string" &&
              message.content.trim()
          )
          .slice(-10)
          .map((message) => ({
            role: message.role,
            content: message.content.trim(),
          }))
      : []),

    {
      role: "user",
      content: question.trim(),
    },
  ];

  try {
    const response = await openrouter.chat.completions.create({
      model:
        process.env.OPENROUTER_MODEL ||
        "openrouter/free",

      messages,

      temperature: 0.3,
    });

    console.log("OpenRouter response received");

    const answer =
      response?.choices?.[0]?.message?.content;

    if (!answer) {
      throw new Error("OpenRouter returned an empty response");
    }

    return answer;
  } catch (error) {
    console.error("OpenRouter AI Error:", error);

    if (error?.status === 402) {
      throw new Error(
        "OpenRouter account does not have sufficient credits for this request."
      );
    }

    if (error?.status === 429) {
      throw new Error(
        "OpenRouter free model rate limit reached. Please try again later."
      );
    }

    throw error;
  }
}