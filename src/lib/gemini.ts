import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.warn('Gemini API key not found. AI question generation will not work.');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface AIQuestionRequest {
  topic: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  count: number;
  type: 'mcq-single' | 'mcq-multiple' | 'true-false' | 'numeric';
}

export interface AIGeneratedQuestion {
  question: string;
  type: 'mcq-single' | 'mcq-multiple' | 'true-false' | 'numeric';
  options?: string[];
  correctAnswer: number | number[] | boolean | string;
  explanation: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags: string[];
}

const createPrompt = (request: AIQuestionRequest): string => {
  const difficultyContext = {
    Easy: 'basic level, suitable for beginners',
    Medium: 'intermediate level, requiring some analysis',
    Hard: 'advanced level, requiring deep thinking and complex reasoning'
  };

  const typeInstructions = {
    'mcq-single': 'Create multiple choice questions with exactly 4 options (A, B, C, D) where only ONE option is correct.',
    'mcq-multiple': 'Create multiple choice questions with exactly 4 options (A, B, C, D) where MULTIPLE options can be correct.',
    'true-false': 'Create true/false questions with clear statements that are either definitely true or definitely false.',
    'numeric': 'Create questions that require a specific numeric answer (integer or decimal).'
  };

  return `Generate ${request.count} high-quality ${request.category.toLowerCase()} questions about "${request.topic}" at ${difficultyContext[request.difficulty]} difficulty.

Question Type: ${typeInstructions[request.type]}

Requirements:
- Questions must be clearly worded and unambiguous
- For MCQ questions, provide exactly 4 options labeled A, B, C, D
- Options should be plausible but only the correct ones should be right
- Include detailed explanations for why the answer is correct
- Make questions relevant to aptitude tests and ${request.category.toLowerCase()} reasoning
- Difficulty should be appropriate for ${request.difficulty} level

Format your response as a JSON array with this exact structure:
[
  {
    "question": "The actual question text",
    "options": ["Option A", "Option B", "Option C", "Option D"], // Only for MCQ types
    "correctAnswer": 0, // Index for single MCQ, array of indices for multiple MCQ, true/false for boolean, number for numeric
    "explanation": "Detailed explanation of why this answer is correct",
    "tags": ["tag1", "tag2", "tag3"] // 2-3 relevant tags
  }
]

Generate exactly ${request.count} questions following this format.`;
};

export async function generateQuestionsWithAI(request: AIQuestionRequest): Promise<AIGeneratedQuestion[]> {
  if (!genAI) {
    throw new Error('Gemini API is not configured. Please check your API key.');
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = createPrompt(request);
    
    console.log('Generating questions with prompt:', prompt);
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('AI Response:', text);
    
    // Clean the response text to extract JSON
    let jsonText = text.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\s*/, '').replace(/```\s*$/, '');
    }
    
    // Try to parse the JSON
    let questions;
    try {
      questions = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', jsonText);
      // Try to extract JSON from the text
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not extract valid JSON from AI response');
      }
    }
    
    if (!Array.isArray(questions)) {
      throw new Error('AI response is not an array of questions');
    }
    
    // Process and validate the questions
    const processedQuestions: AIGeneratedQuestion[] = questions.map((q: any, index: number) => {
      if (!q.question || !q.explanation) {
        throw new Error(`Question ${index + 1} is missing required fields`);
      }
      
      // Ensure options are present for MCQ questions
      if (request.type.includes('mcq') && (!q.options || !Array.isArray(q.options) || q.options.length !== 4)) {
        throw new Error(`Question ${index + 1} must have exactly 4 options for MCQ type`);
      }
      
      // Convert correctAnswer based on type
      let correctAnswer = q.correctAnswer;
      if (request.type === 'true-false') {
        correctAnswer = typeof q.correctAnswer === 'boolean' ? q.correctAnswer : q.correctAnswer === 1 || q.correctAnswer === 'true';
      } else if (request.type === 'numeric') {
        correctAnswer = parseFloat(q.correctAnswer.toString());
      }
      
      return {
        question: q.question,
        type: request.type,
        options: request.type.includes('mcq') ? q.options : undefined,
        correctAnswer,
        explanation: q.explanation,
        category: request.category,
        difficulty: request.difficulty,
        tags: Array.isArray(q.tags) ? q.tags : [request.topic.toLowerCase(), 'ai-generated']
      };
    });
    
    console.log('Successfully generated', processedQuestions.length, 'questions');
    return processedQuestions;
    
  } catch (error) {
    console.error('Error generating questions with AI:', error);
    throw new Error(`Failed to generate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function isGeminiConfigured(): boolean {
  return !!apiKey;
}
