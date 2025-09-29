

// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import cookieParser from "cookie-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HfInference } from "@huggingface/inference";
import { v2 as cloudinary } from "cloudinary";
import PdfPrinter from "pdfmake";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import generateDietPdf from './j.js'

import pdfFonts from "pdfmake/build/vfs_fonts.js";
dotenv.config();

 const app = express();
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// CORS (handles preflight automatically)
app.use(
  cors({
    origin: "https://ayurdietfee-4seu.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Debug request origins only for /api/* routes
const API_ROUTE_REGEX = /^\/api\/.*/;
app.use(API_ROUTE_REGEX,(req, res, next) => {
  console.log(`📡 ${req.method} ${req.originalUrl} from ${req.headers.origin}`);
  next();
});

// Supabase setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseService = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Cloudinary setup
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// AI clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const hf = new HfInference(process.env.HF_API_KEY);

async function ragQuery(userDetails) {
  const userString = `
Name: ${userDetails.name}
Age: ${userDetails.age}
Height: ${userDetails.height}
Weight: ${userDetails.weight}
BP: ${userDetails.BP}
Sugar: ${userDetails.sugar}
Aim: ${userDetails.aim}
Exercise: ${userDetails.exercise}
Water Intake: ${userDetails.waterIntake}
Doshas: ${userDetails.doshas}
`;

  const embeddingResponse = await hf.featureExtraction({
    model: "sentence-transformers/all-mpnet-base-v2",
    inputs: userString,
  });

  // if (!Array.isArray(embeddingResponse) || !Array.isArray(embeddingResponse[0]) || embeddingResponse[0].length !== 768) {
  //   throw new Error("HF embedding did not return a 768-dimensional vector");
  // }

  const queryEmbedding = embeddingResponse; // or embeddingResponse[0]

// 2. CRITICAL FIX: Convert array to PostgreSQL vector string format
// Example: [0.1, 0.2, 0.3] -> "[0.1,0.2,0.3]"
const vectorString = `[${queryEmbedding.join(',')}]`; // should be 768

  // 2️⃣ Fetch top 5 similar documents
  const { data, error } = await supabaseService.rpc("match_documents", {
    query_embedding:vectorString,
    match_count: 5,
  });
  if (error) throw error;

  const contextText = data?.map((d) => d.content).join("\n") || "";

  // 3️⃣ Generate diet JSON
  const prompt = `
You are an expert Ayurvedic dietitian.
User Details: ${JSON.stringify(userDetails)}
Context: ${contextText}
Generate a detailed vegetarian diet chart JSON with home remedies, dosha advice, day-wise meals, and nutrients.
Return only JSON.Provide nutritional value with recepie in the chart.i want to make my diet chart attractive like daily recommendation nutritional value time wise day wise with recepies in a table form and all the diagnosis in other table remedies in other table and user details in a table json
{
  "title": "Personalized Ayurvedic Diet Plan for Fat Loss",
  "introduction": "Namaste Abhinav! As your Ayurvedic dietitian, I've crafted a comprehensive diet plan tailored to your Kapha dosha and your goal of fat loss. This plan focuses on balancing Kapha by incorporating warm, light, dry, and stimulating foods, emphasizing metabolism-boosting spices, and promoting mindful eating. Remember, consistency is key to achieving sustainable results and honoring your body's unique needs.",
  "user_details": {
    "table_name": "Abhinav's Profile",
    "headers": ["Attribute", "Value"],
    "rows": [
      {"Attribute": "Name", "Value": "Abhinav"},
      {"Attribute": "Age", "Value": "30 years"},
      {"Attribute": "Height", "Value": "160 cm (5'3\")"},
      {"Attribute": "Weight", "Value": "80 kg"},
      {"Attribute": "BMI", "Value": "31.25 (Obese Class I)"},
      {"Attribute": "Blood Pressure", "Value": "100 (Normal)"},
      {"Attribute": "Blood Sugar", "Value": "100 (Normal)"},
      {"Attribute": "Primary Aim", "Value": "Fat Loss"},
      {"Attribute": "Exercise Frequency", "Value": "5 times/week"},
      {"Attribute": "Water Intake", "Value": "4 liters/day"},
      {"Attribute": "Dominant Dosha", "Value": "Kapha"}
    ]
  },
  "ayurvedic_diagnosis": {
    "table_name": "Ayurvedic Assessment & Fat Loss Focus",
    "headers": ["Aspect", "Observation", "Ayurvedic Implication", "Dietary Focus"],
    "rows": [
      {"Aspect": "Dosha", "Observation": "Kapha Dominant", "Ayurvedic Implication": "Kapha dosha is characterized by qualities of heavy, slow, cold, oily, and stable. An imbalance often leads to sluggish metabolism, excess weight, water retention, and slower digestion ('mandagni').", "Dietary Focus": "To balance Kapha and promote fat loss, emphasize light, warm, dry, pungent, bitter, and astringent foods. Minimize sweet, sour, and salty tastes, along with cold, heavy, and oily preparations."},
      {"Aspect": "Weight", "Observation": "80 kg (BMI: 31.25 - Obese Class I)", "Ayurvedic Implication": "This indicates an accumulation of 'Meda Dhatu' (fat tissue) and potentially 'Ama' (toxins) due to weakened 'Agni' (digestive fire). Kapha's inherent qualities contribute to this tendency.", "Dietary Focus": "Strict portion control, calorie deficit, consistent meal timings, and regular use of 'agni-deepana' (agni-kindling) and 'ama-pachana' (ama-digesting) spices."},
      {"Aspect": "Aim", "Observation": "Fat Loss", "Ayurvedic Implication": "A focused approach is required to stimulate metabolism, burn accumulated fat, and prevent further Kapha aggregation. This involves balancing diet, lifestyle, and specific remedies.", "Dietary Focus": "Include plenty of fibrous vegetables, lean plant-based proteins, whole grains in moderation, and bitter/pungent herbs. Emphasize warm, freshly cooked meals."},
      {"Aspect": "Overall Health", "Observation": "BP & Sugar Normal", "Ayurvedic Implication": "Good foundational health, which supports the fat loss journey by reducing immediate risks. However, consistent Kapha imbalance over time can predispose to these conditions.", "Dietary Focus": "Maintain healthy blood pressure and sugar levels by avoiding processed foods, refined sugars, and excessive salt, while continuing to focus on Kapha-pacifying foods."}
    ]
  },
  "daily_ayurvedic_recommendations": {
    "table_name": "Daily Ayurvedic Dietary Recommendations for Kapha Balance & Fat Loss",
    "headers": ["Recommendation", "Description"],
    "rows": [
      {"Recommendation": "Emphasize Tastes", "Description": "Prioritize pungent (ginger, black pepper, chili), bitter (leafy greens, fenugreek), and astringent (lentils, beans, apples, berries) tastes. Minimize sweet, sour, and salty foods."},
      {"Recommendation": "Favor Warm & Light", "Description": "Consume warm, freshly cooked meals. Avoid cold foods, cold drinks, and heavy, oily, or deep-fried preparations. Steaming, baking, grilling, and light sautéing are preferred cooking methods."},
      {"Recommendation": "Boost Agni (Digestive Fire)", "Description": "Start your day with warm water. Use metabolism-boosting spices like ginger, turmeric, black pepper, cumin, mustard seeds, and asafoetida (hing) in your cooking to enhance digestion and detoxification."},
      {"Recommendation": "Mindful Eating", "Description": "Eat only when truly hungry, in a calm environment, without distractions. Chew your food thoroughly and eat until you are 75% full, leaving space for digestion. Avoid eating within 3 hours of bedtime."},
      {"Recommendation": "Portion Control", "Description": "Kapha individuals tend to gain weight easily. Be particularly mindful of portion sizes, even with healthy foods, to create a caloric deficit necessary for fat loss."},
      {"Recommendation": "Hydration", "Description": "Continue with your good habit of 4 liters of warm water daily. Infuse it with ginger slices, a squeeze of lemon, or mint leaves to further aid digestion and detoxification."},
      {"Recommendation": "Dinner Timing", "Description": "Eat a light dinner early, ideally before 7 PM, to allow ample time for digestion before sleep. A heavy or late dinner can exacerbate Kapha and hinder fat loss."},
      {"Recommendation": "Minimize Dairy & Sweeteners", "Description": "Strictly limit refined sugar, artificial sweeteners, and heavy dairy products (milk, paneer in large quantities, yogurt). If consuming yogurt, dilute it with water to make buttermilk (chaach) and add spices like roasted cumin and black salt."}
    ]
  },
  "ayurvedic_home_remedies": {
    "table_name": "Ayurvedic Home Remedies for Kapha & Fat Loss",
    "headers": ["Remedy", "Preparation", "How to Use", "Benefits for Kapha/Fat Loss"],
    "rows": [
      {"Remedy": "Warm Water with Lemon & Ginger", "Preparation": "Squeeze half a lemon and add 1-inch grated fresh ginger to a glass of warm water.", "How to Use": "Drink first thing in the morning on an empty stomach. Avoid honey for fat loss.", "Benefits for Kapha/Fat Loss": "Stimulates digestion (Agni), detoxifies the liver, aids in fat metabolism, and helps reduce Kapha accumulation. Lemon is astringent and cleansing; ginger is pungent and warming."},
      {"Remedy": "Trikatu Churna", "Preparation": "Mix equal parts of dry ginger powder, black pepper powder, and long pepper (Pippali) powder.", "How to Use": "Take ½ teaspoon with warm water before meals (1-2 times a day), or sprinkle a pinch on food.", "Benefits for Kapha/Fat Loss": "A potent Kapha-reducing blend. It strongly kindles Agni, boosts metabolism, improves digestion of fats, and helps eliminate Ama (toxins)."},
      {"Remedy": "Cumin-Coriander-Fennel (CCF) Tea", "Preparation": "Boil 1 tsp each of whole cumin, coriander, and fennel seeds in 2 cups of water for 5-10 minutes. Strain.", "How to Use": "Sip throughout the day, especially after meals, as a digestive aid.", "Benefits for Kapha/Fat Loss": "Aids digestion, reduces bloating and gas, detoxifies the body, gently stimulates metabolism, and is tridoshic (balances all doshas), particularly beneficial for Kapha."},
      {"Remedy": "Methi Dana (Fenugreek Seeds)", "Preparation": "Soak 1 teaspoon of fenugreek seeds overnight in water.", "How to Use": "Chew the soaked seeds and drink the water first thing in the morning.", "Benefits for Kapha/Fat Loss": "Possesses bitter and pungent qualities, excellent for reducing Kapha, helps in regulating blood sugar, improves digestion, and supports fat metabolism, especially beneficial for Kapha-related weight concerns."}
    ]
  },
  "diet_chart": {
    "table_name": "7-Day Vegetarian Ayurvedic Diet Chart for Fat Loss (Kapha Balancing)",
    "headers": ["Time", "Meal Type", "Recipe", "Nutritional Value (Approx.)"],
    "days": [
      {
        "day": "Monday",
        "meals": [
          {"Time": "6:30 AM", "Meal Type": "Early Morning", "Recipe": "Warm water with half a lemon and 1 tsp grated fresh ginger.", "Nutritional Value": {"Calories": 5, "Protein": 0, "Carbs": 1, "Fat": 0}},
          {"Time": "8:00 AM", "Meal Type": "Breakfast", "Recipe": "Oats Upma with Mixed Vegetables (1 medium bowl): Cooked with rolled oats, carrots, peas, beans, mustard seeds, curry leaves, and a pinch of turmeric. Use minimal oil.", "Nutritional Value": {"Calories": 300, "Protein": 10, "Carbs": 45, "Fat": 7}},
          {"Time": "11:00 AM", "Meal Type": "Mid-morning", "Recipe": "1 medium apple or a handful of roasted chana (chickpeas).", "Nutritional Value": {"Calories": 120, "Protein": 3, "Carbs": 30, "Fat": 1}},
          {"Time": "1:00 PM", "Meal Type": "Lunch", "Recipe": "Mixed Vegetable Dal (1 medium bowl) with Quinoa (¾ cup cooked) and a medium bowl of steamed green beans. Seasoned with ginger, garlic, cumin, and coriander.", "Nutritional Value": {"Calories": 450, "Protein": 22, "Carbs": 60, "Fat": 10}},
          {"Time": "4:30 PM", "Meal Type": "Evening Snack", "Recipe": "Herbal tea (ginger-tulsi) with 5-6 almonds.", "Nutritional Value": {"Calories": 50, "Protein": 2, "Carbs": 5, "Fat": 3}},
          {"Time": "7:00 PM", "Meal Type": "Dinner", "Recipe": "Lauki (Bottle Gourd) Sabzi (1 medium bowl) with 2 medium Multigrain Rotis. Use minimal oil.", "Nutritional Value": {"Calories": 380, "Protein": 12, "Carbs": 50, "Fat": 9}},
          {"Time": "9:30 PM", "Meal Type": "Before Bed", "Recipe": "Warm water with a pinch of turmeric.", "Nutritional Value": {"Calories": 2, "Protein": 0, "Carbs": 0, "Fat": 0}}
        ]
      },
      {
        "day": "Tuesday",
        "meals": [
          {"Time": "6:30 AM", "Meal Type": "Early Morning", "Recipe": "Warm water with ½ tsp soaked fenugreek seeds.", "Nutritional Value": {"Calories": 10, "Protein": 0, "Carbs": 2, "Fat": 0}},
          {"Time": "8:00 AM", "Meal Type": "Breakfast", "Recipe": "Moong Dal Cheela (2 medium) with Mint Chutney. Cooked with minimal oil.", "Nutritional Value": {"Calories": 320, "Protein": 18, "Carbs": 35, "Fat": 9}},
          {"Time": "11:00 AM", "Meal Type": "Mid-morning", "Recipe": "Medium bowl of papaya or a cucumber salad.", "Nutritional Value": {"Calories": 90, "Protein": 1, "Carbs": 22, "Fat": 0}},
          {"Time": "1:00 PM", "Meal Type": "Lunch", "Recipe": "Brown Rice (¾ cup cooked) with Chole (Chickpea Curry - 1 medium bowl, less oil) and a side of mixed green salad.", "Nutritional Value": {"Calories": 480, "Protein": 20, "Carbs": 70, "Fat": 10}},
          {"Time": "4:30 PM", "Meal Type": "Evening Snack", "Recipe": "Handful of makhana (fox nuts) roasted with a pinch of black salt and pepper.", "Nutritional Value": {"Calories": 60, "Protein": 3, "Carbs": 12, "Fat": 1}},
          {"Time": "7:00 PM", "Meal Type": "Dinner", "Recipe": "Steamed Vegetable Soup (clear, with lots of vegetables like broccoli, spinach, carrots, beans) with a sprinkle of black pepper.", "Nutritional Value": {"Calories": 180, "Protein": 7, "Carbs": 25, "Fat": 4}},
          {"Time": "9:30 PM", "Meal Type": "Before Bed", "Recipe": "CCF Tea (Cumin-Coriander-Fennel Tea).", "Nutritional Value": {"Calories": 5, "Protein": 0, "Carbs": 1, "Fat": 0}}
        ]
      },
      {
        "day": "Wednesday",
        "meals": [
          {"Time": "6:30 AM", "Meal Type": "Early Morning", "Recipe": "Warm water with 1 tsp Triphala Churna (consult a practitioner first for dosage/suitability).", "Nutritional Value": {"Calories": 5, "Protein": 0, "Carbs": 1, "Fat": 0}},
          {"Time": "8:00 AM", "Meal Type": "Breakfast", "Recipe": "Vegetable Poha (1 medium bowl) with finely chopped onions, peas, and peanuts (minimal). Use minimal oil.", "Nutritional Value": {"Calories": 300, "Protein": 8, "Carbs": 45, "Fat": 8}},
          {"Time": "11:00 AM", "Meal Type": "Mid-morning", "Recipe": "Guava (1 medium) or a handful of sunflower seeds.", "Nutritional Value": {"Calories": 90, "Protein": 3, "Carbs": 18, "Fat": 3}},
          {"Time": "1:00 PM", "Meal Type": "Lunch", "Recipe": "Lentil Soup (yellow dal - 1 medium bowl) with 2 medium Jowar/Bajra Rotis and a side of cooked bitter gourd (karela) sabzi.", "Nutritional Value": {"Calories": 450, "Protein": 18, "Carbs": 60, "Fat": 10}},
          {"Time": "4:30 PM", "Meal Type": "Evening Snack", "Recipe": "Sprout Salad (mung bean sprouts with chopped cucumber, tomato, lemon juice, chaat masala).", "Nutritional Value": {"Calories": 90, "Protein": 5, "Carbs": 15, "Fat": 1}},
          {"Time": "7:00 PM", "Meal Type": "Dinner", "Recipe": "Palak Paneer (spinach with cottage cheese - medium portion of paneer, more spinach) with 1 medium Multigrain Roti.", "Nutritional Value": {"Calories": 400, "Protein": 18, "Carbs": 30, "Fat": 20}},
          {"Time": "9:30 PM", "Meal Type": "Before Bed", "Recipe": "Warm water infused with ginger slices.", "Nutritional Value": {"Calories": 2, "Protein": 0, "Carbs": 0, "Fat": 0}}
        ]
      },
      {
        "day": "Thursday",
        "meals": [
          {"Time": "6:30 AM", "Meal Type": "Early Morning", "Recipe": "Warm water with lemon and a pinch of black pepper.", "Nutritional Value": {"Calories": 5, "Protein": 0, "Carbs": 1, "Fat": 0}},
          {"Time": "8:00 AM", "Meal Type": "Breakfast", "Recipe": "Besan Cheela (2 medium) with mixed vegetable stuffing (finely chopped onions, capsicum, carrots). Cooked with minimal oil.", "Nutritional Value": {"Calories": 310, "Protein": 15, "Carbs": 35, "Fat": 8}},
          {"Time": "11:00 AM", "Meal Type": "Mid-morning", "Recipe": "Pear (1 medium) or a handful of roasted pumpkin seeds.", "Nutritional Value": {"Calories": 100, "Protein": 3, "Carbs": 22, "Fat": 2}},
          {"Time": "1:00 PM", "Meal Type": "Lunch", "Recipe": "Vegetable Khichdi (light, made with moong dal and brown rice/quinoa, lots of vegetables like peas, carrots, beans). 1 large bowl.", "Nutritional Value": {"Calories": 430, "Protein": 18, "Carbs": 55, "Fat": 9}},
          {"Time": "4:30 PM", "Meal Type": "Evening Snack", "Recipe": "Medium bowl of vegetable clear soup or a cup of green tea.", "Nutritional Value": {"Calories": 40, "Protein": 2, "Carbs": 7, "Fat": 1}},
          {"Time": "7:00 PM", "Meal Type": "Dinner", "Recipe": "Grilled Paneer/Tofu Skewers with bell peppers and onions (medium portion, marinated with Kapha-balancing spices like ginger, chilli, turmeric).", "Nutritional Value": {"Calories": 370, "Protein": 25, "Carbs": 15, "Fat": 22}},
          {"Time": "9:30 PM", "Meal Type": "Before Bed", "Recipe": "Warm water.", "Nutritional Value": {"Calories": 0, "Protein": 0, "Carbs": 0, "Fat": 0}}        
        ]
      },
      {
        "day": "Friday",
        "meals": [
          {"Time": "6:30 AM", "Meal Type": "Early Morning", "Recipe": "Warm water with a pinch of Trikatu Churna (½ tsp).", "Nutritional Value": {"Calories": 5, "Protein": 0, "Carbs": 1, "Fat": 0}},
          {"Time": "8:00 AM", "Meal Type": "Breakfast", "Recipe": "Sprout Salad (mung bean sprouts, finely chopped cucumber, tomato, green chilli, lemon juice). 1 medium bowl.", "Nutritional Value": {"Calories": 260, "Protein": 12, "Carbs": 30, "Fat": 5}},
          {"Time": "11:00 AM", "Meal Type": "Mid-morning", "Recipe": "Orange (1 medium) or a handful of flax seeds.", "Nutritional Value": {"Calories": 90, "Protein": 3, "Carbs": 20, "Fat": 2}},
          {"Time": "1:00 PM", "Meal Type": "Lunch", "Recipe": "Rajma (Kidney Bean Curry - 1 medium bowl, less oil) with Brown Rice (¾ cup cooked) and a medium bowl of steamed broccoli.", "Nutritional Value": {"Calories": 460, "Protein": 20, "Carbs": 60, "Fat": 10}},
          {"Time": "4:30 PM", "Meal Type": "Evening Snack", "Recipe": "Roasted chana (¾ cup) with a sprinkle of spices.", "Nutritional Value": {"Calories": 150, "Protein": 8, "Carbs": 25, "Fat": 3}},
          {"Time": "7:00 PM", "Meal Type": "Dinner", "Recipe": "Cabbage and Peas Sabzi (1 medium bowl) with 2 medium Multigrain Rotis. Use minimal oil.", "Nutritional Value": {"Calories": 350, "Protein": 10, "Carbs": 45, "Fat": 8}},
          {"Time": "9:30 PM", "Meal Type": "Before Bed", "Recipe": "Warm water with 1 tsp ginger juice.", "Nutritional Value": {"Calories": 2, "Protein": 0, "Carbs": 0, "Fat": 0}}
        ]
      },
      {
        "day": "Saturday",
        "meals": [
          {"Time": "6:30 AM", "Meal Type": "Early Morning", "Recipe": "Warm water with 1 tsp Apple Cider Vinegar (with mother) - optional, for those who tolerate it well.", "Nutritional Value": {"Calories": 2, "Protein": 0, "Carbs": 0, "Fat": 0}},
          {"Time": "8:00 AM", "Meal Type": "Breakfast", "Recipe": "Savory Semolina (Suji) Upma with lots of vegetables (carrots, beans, capsicum). 1 medium bowl.", "Nutritional Value": {"Calories": 310, "Protein": 9, "Carbs": 48, "Fat": 8}},
          {"Time": "11:00 AM", "Meal Type": "Mid-morning", "Recipe": "Pomegranate (½ cup) or a handful of walnuts.", "Nutritional Value": {"Calories": 110, "Protein": 3, "Carbs": 22, "Fat": 4}},
          {"Time": "1:00 PM", "Meal Type": "Lunch", "Recipe": "Mixed Vegetable Curry (1 medium bowl, light coconut milk if used, otherwise tomato-based) with 2 medium Jowar Rotis.", "Nutritional Value": {"Calories": 440, "Protein": 15, "Carbs": 55, "Fat": 12}},
          {"Time": "4:30 PM", "Meal Type": "Evening Snack", "Recipe": "CCF Tea (Cumin-Coriander-Fennel Tea) with a handful of roasted peanuts.", "Nutritional Value": {"Calories": 80, "Protein": 4, "Carbs": 8, "Fat": 4}},
          {"Time": "7:00 PM", "Meal Type": "Dinner", "Recipe": "Mushroom and Peas Curry (1 medium bowl, minimal cream) with 1 medium Multigrain Roti.", "Nutritional Value": {"Calories": 370, "Protein": 15, "Carbs": 35, "Fat": 18}},
          {"Time": "9:30 PM", "Meal Type": "Before Bed", "Recipe": "Warm water with a pinch of ginger powder.", "Nutritional Value": {"Calories": 2, "Protein": 0, "Carbs": 0, "Fat": 0}}
        ]
      },
      {
        "day": "Sunday",
        "meals": [
          {"Time": "6:30 AM", "Meal Type": "Early Morning", "Recipe": "Warm water with ½ tsp soaked Methi Dana.", "Nutritional Value": {"Calories": 10, "Protein": 0, "Carbs": 2, "Fat": 0}},
          {"Time": "8:00 AM", "Meal Type": "Breakfast", "Recipe": "Vegetable Dalia (broken wheat) Porridge (1 medium bowl) with carrots, peas, and green beans.", "Nutritional Value": {"Calories": 300, "Protein": 10, "Carbs": 45, "Fat": 7}},
          {"Time": "11:00 AM", "Meal Type": "Mid-morning", "Recipe": "Medium bowl of berries (strawberries/raspberries) or a handful of almonds.", "Nutritional Value": {"Calories": 100, "Protein": 3, "Carbs": 20, "Fat": 3}},
          {"Time": "1:00 PM", "Meal Type": "Lunch", "Recipe": "Sambar (1 medium bowl, lots of vegetables) with Idli (2 medium) or Dosa (1 medium, thin).", "Nutritional Value": {"Calories": 450, "Protein": 18, "Carbs": 55, "Fat": 12}},
          {"Time": "4:30 PM", "Meal Type": "Evening Snack", "Recipe": "Clear Tomato Soup (homemade) with a sprinkle of pepper.", "Nutritional Value": {"Calories": 50, "Protein": 2, "Carbs": 10, "Fat": 1}},
          {"Time": "7:00 PM", "Meal Type": "Dinner", "Recipe": "Mixed Vegetable Stir-fry (broccoli, capsicum, carrots, mushrooms) with light soy sauce (optional) or just Kapha-balancing spices. No rice/roti.", "Nutritional Value": {"Calories": 280, "Protein": 12, "Carbs": 30, "Fat": 10}},
          {"Time": "9:30 PM", "Meal Type": "Before Bed", "Recipe": "Warm water with a slice of fresh ginger.", "Nutritional Value": {"Calories": 2, "Protein": 0, "Carbs": 0, "Fat": 0}}
        ]
      }
    ]
  },
  "important_notes": [
    "**Listen to Your Body (Prakriti and Vikriti)**: While this plan is tailored for your Kapha dosha, always pay attention to your body's unique signals. Adjust portions or ingredients based on your hunger, digestion, and how you feel. Ayurveda emphasizes individual variability.",
    "**Cooking Medium**: Use minimal healthy fats like Ghee (clarified butter) in moderation, or small amounts of mustard oil/sesame oil for cooking. Kapha benefits from dry heat and minimal oil.",
    "**Spices are Your Allies**: Liberally use Kapha-pacifying and Agni-kindling spices such as ginger, black pepper, turmeric, cumin, mustard seeds, and asafoetida (hing) in your cooking. These are vital for boosting metabolism.",
    "**Avoid Cold & Raw (in excess)**: Minimize cold beverages, ice cream, and excessive raw salads, especially in cooler weather, as they can dampen Agni and increase Kapha. If consuming raw salads, ensure they are fresh, well-seasoned with warming spices, and consumed during lunchtime (when Agni is strongest).",
    "**Sugar & Dairy**: Strictly limit refined sugar, processed foods, and heavy dairy products. If consuming milk, always boil it and add a pinch of turmeric or ginger. For yogurt, convert it to spiced buttermilk (chaach) by diluting it with water and adding black salt, roasted cumin powder.",
    "**Consistency**: Regularity in meal times and choices is paramount for Kapha individuals. Aim for consistency over perfection, making sustainable changes.",  
    "**Exercise**: Continue your 5 days/week exercise regimen. For Kapha, vigorous, warming, and stimulating exercise is highly recommended to counteract the heavy, slow qualities.",
    "**Professional Guidance**: If you have any underlying health conditions, allergies, or concerns, consult with an Ayurvedic physician or healthcare professional before making significant dietary and lifestyle changes. This plan is for general guidance."
  ]
}
keep other in  this format generate pdf in table form 
`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
  const response = await model.generateContent(prompt);

  return (response.response.candidates[0].content.parts[0].text.replace(/```(json)?/g, '').trim());
}
async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not logged in');
  }
  
  console.log('User ID:', user.id);
  return user.id;
}
// -------------------- Cloudinary upload --------------------
async function uploadPdfBufferToCloudinary(pdfBuffer) {
  const tempPath = `./temp_${Date.now()}.pdf`;
  fs.writeFileSync(tempPath, pdfBuffer);
  const result = await cloudinary.uploader.upload(tempPath, { resource_type: "raw", format: "pdf" });
  fs.unlinkSync(tempPath);
  return result.secure_url;
}

// -------------------- API endpoint --------------------
app.post("/generate-diet-pdf", async (req, res) => {
  try {
            const { name, age, height, weight, BP, sugar, aim, exercise, waterIntake, dosha } = req.body;
        const patientData = { name, age, height, weight, BP, sugar, aim, exercise, waterIntake, dosha };

        // 1️⃣ Generate Diet JSON
        const dietJSON = await ragQuery(patientData);
// console.log(JSON.parse(dietJSON))
        const pdfBytes = await generateDietPdf(JSON.parse(dietJSON));
          // console.log(Buffer.from(pdfBytes))
             const cloudinary_pdf_url= await uploadPdfBufferToCloudinary( pdfBytes);
            //  console.log(cloudinary_pdf_url)
        // const user_id = await getUserId(); // From Supabase Auth
        //   await supabase.from('patient_diet_pdfs').insert({
        //     patient_name: 'name',
        //       doctor_id: user_id,
        //     dosha: dosha,
        //             pdf_url: cloudinary_pdf_url
        //           });

    // Send PDF to browser for download
    // res.setHeader("Content-Type", "application/pdf");
    // res.setHeader("Content-Disposition", 'attachment; filename="AyurvedicDietPlan.pdf"');
    // res.send(Buffer.from(pdfBytes));
   res.json({
            success: true,
            pdfUrl: cloudinary_pdf_url
        });} catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// --- OAuth: Supabase login/logout ---

// Login with Google
app.get("/auth/login", async (req, res) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: process.env.REDIRECT_URL },
  });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ login_url: data.url });
});

// OAuth callback
app.get("/auth/callback", async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.status(400).send("Missing access token");

  const { data, error } = await supabase.auth.getUser(access_token);
  if (error) return res.status(400).json({ error: error.message });

  const user = data.user;

  // Insert profile if not exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata.full_name,
    });
  }

  res.cookie("sb-access-token", access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  res.json({Logged :user});
});

// Logout
app.post("/auth/logout", (req, res) => {
  res.clearCookie("sb-access-token");
  res.json({ message: "Logged out" });
});

// -------------------- Start server --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
