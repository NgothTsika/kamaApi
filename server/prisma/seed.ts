import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const connectionString = `${process.env.DATABASE_URL ?? ""}`;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL for prisma seed.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting KamaGame seed...");

  // ==================== ADMIN USER ====================
  const adminEmail = "admin@kamagame.com";
  // Use SEED_ADMIN_PASSWORD env var if provided, otherwise use default (CHANGE IN PRODUCTION!)
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@ngoth09";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminPasswordHash,
    },
    create: {
      email: adminEmail,
      username: "admin",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      emailVerified: true,
    },
  });

  console.log(`✅ Admin user: ${adminEmail} (Password: ${adminPassword})`);

  // ==================== CATEGORIES ====================
  // Seeds comprehensive categories from seedNote.txt

  const categoriesData = [
    // ========== TOP LEVEL CATEGORIES ==========
    {
      name: "Africa",
      slug: "africa",
      parentSlug: null,
      description:
        "The birthplace of humanity, home to diverse cultures, ancient kingdoms, and modern nations.",
      order: 0,
    },
    {
      name: "Diaspora",
      slug: "diaspora",
      parentSlug: null,
      description:
        "Communities of African descent across the Americas, Caribbean, Europe, and beyond.",
      order: 1,
    },
    {
      name: "Ancient Civilizations",
      slug: "ancient-civilizations",
      parentSlug: null,
      description: "Early African civilizations that shaped human history.",
      order: 2,
    },
    {
      name: "Empires & Kingdoms",
      slug: "empires-kingdoms",
      parentSlug: null,
      description:
        "Medieval and early modern African empires that dominated trade, culture, and politics.",
      order: 3,
    },
    {
      name: "Colonial Era",
      slug: "colonial-era",
      parentSlug: null,
      description:
        "European colonization, resistance, and the transatlantic slave trade.",
      order: 4,
    },
    {
      name: "Independence & Modern",
      slug: "independence-modern",
      parentSlug: null,
      description: "Decolonization, nation-building, and contemporary Africa.",
      order: 5,
    },
    {
      name: "Culture",
      slug: "culture",
      parentSlug: null,
      description:
        "Art, music, literature, and traditions of African and Black peoples.",
      order: 6,
    },
    {
      name: "Science & Innovation",
      slug: "science-innovation",
      parentSlug: null,
      description:
        "Contributions of African and Black people to science, technology, and invention.",
      order: 7,
    },
    {
      name: "Warriors & Leaders",
      slug: "warriors-leaders",
      parentSlug: null,
      description: "Military leaders, monarchs, and political visionaries.",
      order: 8,
    },
    {
      name: "Activists & Civil Rights",
      slug: "activists-civil-rights",
      parentSlug: null,
      description: "Campaigners for equality and justice.",
      order: 9,
    },
    {
      name: "Religion & Spirituality",
      slug: "religion-spirituality",
      parentSlug: null,
      description: "Belief systems, rituals, and spiritual traditions.",
      order: 10,
    },
    {
      name: "Figures by Profession",
      slug: "figures-by-profession",
      parentSlug: null,
      description: "Categorization by fields of achievement.",
      order: 11,
    },
    {
      name: "Women in History",
      slug: "women-in-history",
      parentSlug: null,
      description: "Queens, activists, and pioneering women.",
      order: 12,
    },
    {
      name: "Trade & Economics",
      slug: "trade-economics",
      parentSlug: null,
      description: "Salt, gold, commerce, and economic systems.",
      order: 13,
    },
    {
      name: "Prehistory",
      slug: "prehistory",
      parentSlug: null,
      description: "Human origins and early African societies.",
      order: 14,
    },

    // ========== AFRICA SUBCATEGORIES ==========
    {
      name: "West Africa",
      slug: "west-africa",
      parentSlug: "africa",
      description:
        "Region known for powerful empires (Ghana, Mali, Songhai), vibrant cultures, and the transatlantic slave trade.",
      order: 0,
    },
    {
      name: "East Africa",
      slug: "east-africa",
      parentSlug: "africa",
      description:
        "Cradle of humanity, Swahili coast, Great Lakes kingdoms, and ancient Aksum.",
      order: 1,
    },
    {
      name: "Central Africa",
      slug: "central-africa",
      parentSlug: "africa",
      description:
        "Rainforest kingdoms (Kongo, Luba, Lunda), diverse ethnic groups, and colonial history.",
      order: 2,
    },
    {
      name: "Southern Africa",
      slug: "southern-africa",
      parentSlug: "africa",
      description:
        "Great Zimbabwe, Zulu Kingdom, Ndebele, San people, and the struggle against apartheid.",
      order: 3,
    },
    {
      name: "North Africa",
      slug: "north-africa",
      parentSlug: "africa",
      description:
        "Ancient Egypt, Carthage, Numidia, Amazigh (Berber) cultures, and Islamic empires.",
      order: 4,
    },

    // ========== DIASPORA SUBCATEGORIES ==========
    {
      name: "Caribbean",
      slug: "caribbean",
      parentSlug: "diaspora",
      description:
        "Maroon societies, Haitian Revolution, reggae, carnival, and African retentions.",
      order: 0,
    },
    {
      name: "North America",
      slug: "north-america",
      parentSlug: "diaspora",
      description:
        "African American history, Civil Rights Movement, Harlem Renaissance, Black culture in USA and Canada.",
      order: 1,
    },
    {
      name: "South America",
      slug: "south-america",
      parentSlug: "diaspora",
      description:
        "Afro-Brazilian quilombos, Afro-Colombian communities, candomblé, and capoeira.",
      order: 2,
    },
    {
      name: "Europe",
      slug: "europe",
      parentSlug: "diaspora",
      description:
        "Black communities in the UK, France, Germany, and the African presence in Europe since Roman times.",
      order: 3,
    },

    // ========== ANCIENT CIVILIZATIONS SUBCATEGORIES ==========
    {
      name: "Ancient Egypt",
      slug: "ancient-egypt",
      parentSlug: "ancient-civilizations",
      description:
        "Pharaohs, pyramids, hieroglyphs, and the Nile Valley civilization.",
      order: 0,
    },
    {
      name: "Kingdom of Kush",
      slug: "kingdom-of-kush",
      parentSlug: "ancient-civilizations",
      description:
        "Nubian kingdom that ruled Egypt as the 25th Dynasty, known for pyramids at Meroë.",
      order: 1,
    },
    {
      name: "Nok Culture",
      slug: "nok-culture",
      parentSlug: "ancient-civilizations",
      description:
        "West Africa's earliest known civilization (c. 1500 BCE – 500 CE), famous for terracotta sculptures.",
      order: 2,
    },
    {
      name: "Kingdom of Aksum",
      slug: "kingdom-of-aksum",
      parentSlug: "ancient-civilizations",
      description:
        "Ethiopian empire that controlled Red Sea trade, adopted Christianity early.",
      order: 3,
    },
    {
      name: "Great Zimbabwe",
      slug: "great-zimbabwe",
      parentSlug: "ancient-civilizations",
      description:
        "Stone city and trade empire in southern Africa (c. 1000–1450 CE).",
      order: 4,
    },

    // ========== EMPIRES & KINGDOMS SUBCATEGORIES ==========
    {
      name: "Ghana Empire",
      slug: "ghana-empire",
      parentSlug: "empires-kingdoms",
      description:
        "Wagadou Empire (c. 300–1200 CE), center of gold and salt trade.",
      order: 0,
    },
    {
      name: "Mali Empire",
      slug: "mali-empire",
      parentSlug: "empires-kingdoms",
      description: "Famous for Mansa Musa, Timbuktu, and trans-Saharan trade.",
      order: 1,
    },
    {
      name: "Songhai Empire",
      slug: "songhai-empire",
      parentSlug: "empires-kingdoms",
      description: "Largest West African empire under Askia the Great.",
      order: 2,
    },
    {
      name: "Benin Kingdom",
      slug: "benin-kingdom",
      parentSlug: "empires-kingdoms",
      description: "Famed for bronze casting and the Oba's court (Nigeria).",
      order: 3,
    },
    {
      name: "Kongo Kingdom",
      slug: "kongo-kingdom",
      parentSlug: "empires-kingdoms",
      description:
        "Central African kingdom that embraced Christianity and resisted Portuguese colonization.",
      order: 4,
    },
    {
      name: "Zulu Kingdom",
      slug: "zulu-kingdom",
      parentSlug: "empires-kingdoms",
      description:
        "Southern African kingdom under Shaka, known for military innovation.",
      order: 5,
    },

    // ========== COLONIAL ERA SUBCATEGORIES ==========
    {
      name: "Transatlantic Slave Trade",
      slug: "slave-trade",
      parentSlug: "colonial-era",
      description:
        "The forced migration of millions of Africans, Middle Passage, and its lasting impact.",
      order: 0,
    },
    {
      name: "Resistance Movements",
      slug: "resistance-movements",
      parentSlug: "colonial-era",
      description:
        "Slave revolts, anti-colonial wars, and leaders like Queen Nzinga, Samori Touré.",
      order: 1,
    },

    // ========== INDEPENDENCE & MODERN SUBCATEGORIES ==========
    {
      name: "Independence Movements",
      slug: "independence-movements",
      parentSlug: "independence-modern",
      description:
        "Struggles for freedom from colonial rule (Ghana, Kenya, Algeria, etc.).",
      order: 0,
    },
    {
      name: "Pan-Africanism",
      slug: "pan-africanism",
      parentSlug: "independence-modern",
      description:
        "Philosophy and movement for African unity, figures like Kwame Nkrumah, W.E.B. Du Bois.",
      order: 1,
    },

    // ========== CULTURE SUBCATEGORIES ==========
    {
      name: "Art & Architecture",
      slug: "art-architecture",
      parentSlug: "culture",
      description:
        "From ancient Nok terracottas to modern African art, and architectural marvels.",
      order: 0,
    },
    {
      name: "Music & Dance",
      slug: "music-dance",
      parentSlug: "culture",
      description:
        "Jazz, blues, Afrobeat, reggae, hip-hop, and traditional rhythms.",
      order: 1,
    },
    {
      name: "Literature & Poetry",
      slug: "literature-poetry",
      parentSlug: "culture",
      description:
        "Oral traditions, Negritude, African novel, and contemporary writers.",
      order: 2,
    },
    {
      name: "Fashion & Textiles",
      slug: "fashion-textiles",
      parentSlug: "culture",
      description:
        "Kente cloth, Ankara, adire, and global Black fashion icons.",
      order: 3,
    },

    // ========== SCIENCE & INNOVATION SUBCATEGORIES ==========
    {
      name: "Ancient Innovations",
      slug: "ancient-innovations",
      parentSlug: "science-innovation",
      description:
        "Mathematics, medicine, metallurgy, and astronomy in ancient Africa.",
      order: 0,
    },
    {
      name: "Modern Inventors",
      slug: "modern-inventors",
      parentSlug: "science-innovation",
      description:
        "Black inventors from Garrett Morgan to modern tech pioneers.",
      order: 1,
    },
    {
      name: "Medicine & Health",
      slug: "medicine-health",
      parentSlug: "science-innovation",
      description:
        "Traditional healers, modern medical breakthroughs, and public health leaders.",
      order: 2,
    },

    // ========== WARRIORS & LEADERS SUBCATEGORIES ==========
    {
      name: "Military Leaders",
      slug: "military-leaders",
      parentSlug: "warriors-leaders",
      description:
        "Shaka Zulu, Queen Amina, Hannibal, and other strategic minds.",
      order: 0,
    },
    {
      name: "Political Leaders",
      slug: "political-leaders",
      parentSlug: "warriors-leaders",
      description: "Presidents, prime ministers, and independence fighters.",
      order: 1,
    },

    // ========== ACTIVISTS & CIVIL RIGHTS SUBCATEGORIES ==========
    {
      name: "Civil Rights Movement (USA)",
      slug: "civil-rights-usa",
      parentSlug: "activists-civil-rights",
      description:
        "Martin Luther King Jr., Rosa Parks, and the struggle for racial equality.",
      order: 0,
    },
    {
      name: "Anti-Apartheid Movement",
      slug: "anti-apartheid",
      parentSlug: "activists-civil-rights",
      description:
        "Nelson Mandela, Steve Biko, and the fight against apartheid in South Africa.",
      order: 1,
    },
    {
      name: "Black Lives Matter",
      slug: "black-lives-matter",
      parentSlug: "activists-civil-rights",
      description: "Contemporary movement for racial justice.",
      order: 2,
    },

    // ========== RELIGION & SPIRITUALITY SUBCATEGORIES ==========
    {
      name: "African Traditional Religions",
      slug: "african-traditional-religions",
      parentSlug: "religion-spirituality",
      description: "Yoruba, Akan, Vodun, and other indigenous faiths.",
      order: 0,
    },
    {
      name: "Islam in Africa",
      slug: "islam-africa",
      parentSlug: "religion-spirituality",
      description:
        "Spread of Islam across the continent and its cultural impact.",
      order: 1,
    },
    {
      name: "Christianity in Africa",
      slug: "christianity-africa",
      parentSlug: "religion-spirituality",
      description:
        "Ancient Ethiopian Orthodox, colonial missions, and modern African churches.",
      order: 2,
    },
    {
      name: "Diaspora Religions",
      slug: "diaspora-religions",
      parentSlug: "religion-spirituality",
      description:
        "Vodou, Santería, Candomblé, and other syncretic traditions.",
      order: 3,
    },

    // ========== FIGURES BY PROFESSION SUBCATEGORIES ==========
    {
      name: "Writers & Philosophers",
      slug: "writers-philosophers",
      parentSlug: "figures-by-profession",
      description: "Chinua Achebe, Toni Morrison, Frantz Fanon, etc.",
      order: 0,
    },
    {
      name: "Artists & Musicians",
      slug: "artists-musicians",
      parentSlug: "figures-by-profession",
      description: "Visual artists, composers, and performers.",
      order: 1,
    },
    {
      name: "Athletes",
      slug: "athletes",
      parentSlug: "figures-by-profession",
      description: "Olympic champions, boxers, and sports pioneers.",
      order: 2,
    },
    {
      name: "Scientists & Inventors",
      slug: "scientists-inventors",
      parentSlug: "figures-by-profession",
      description: "Researchers, engineers, and innovators.",
      order: 3,
    },
  ];

  // Create or update all categories
  for (const catData of categoriesData) {
    await prisma.category.upsert({
      where: { slug: catData.slug },
      update: {
        name: catData.name,
        description: catData.description,
        order: catData.order,
      },
      create: {
        name: catData.name,
        slug: catData.slug,
        description: catData.description,
        order: catData.order,
      },
    });
  }

  console.log(`✅ Created/updated ${categoriesData.length} categories`);

  // Get the main category for default content
  const category = await prisma.category.findUnique({
    where: { slug: "ancient-civilizations" },
  });

  if (!category) {
    throw new Error("Failed to create ancient-civilizations category");
  }

  const topic = await prisma.topic.upsert({
    where: { slug: "african-civilizations" },
    update: {
      name: "African Civilizations",
      description: "Explore key civilizations and their legacies.",
    },
    create: {
      name: "African Civilizations",
      slug: "african-civilizations",
      description: "Explore key civilizations and their legacies.",
      parentId: null,
    },
  });

  const lessonSlug = "kama-intro-to-african-civilizations";
  const lesson = await prisma.lesson.upsert({
    where: { slug: lessonSlug },
    update: {
      title: "Intro: African Civilizations",
      description: "A short introduction to key African civilizations.",
      content:
        "## Welcome\n\nAfrica is home to civilizations with deep history, innovation, and cultural influence.\n",
      hook: "Start your journey into African history.",
      published: true,
      xpReward: 10,
      isPremium: false,
      categoryId: category.id,
      topicId: topic.id,
      order: 0,
    },
    create: {
      title: "Intro: African Civilizations",
      slug: lessonSlug,
      description: "A short introduction to key African civilizations.",
      content:
        "## Welcome\n\nAfrica is home to civilizations with deep history, innovation, and cultural influence.\n",
      hook: "Start your journey into African history.",
      published: true,
      xpReward: 10,
      isPremium: false,
      categoryId: category.id,
      topicId: topic.id,
      order: 0,
    },
  });

  // ==================== LESSON TRANSLATION ====================
  // There is no separate Language table in your schema; translations store language as a String.
  const lessonTranslationExisting = await prisma.lessonTranslation.findFirst({
    where: { lessonId: lesson.id, language: "en" },
    select: { id: true },
  });

  if (!lessonTranslationExisting) {
    await prisma.lessonTranslation.create({
      data: {
        lessonId: lesson.id,
        language: "en",
        title: "Intro: African Civilizations",
        description: "A short introduction to key African civilizations.",
        hook: lesson.hook ?? undefined,
        content: lesson.content,
      },
    });
  }

  // ==================== CHAPTERS + QUIZZES ====================
  const chapterCount = await prisma.chapter.count({
    where: { lessonId: lesson.id },
  });
  if (chapterCount === 0) {
    await prisma.chapter.createMany({
      data: [
        {
          lessonId: lesson.id,
          title: "Chapter 1: Origins",
          content:
            "African civilizations developed through diverse regions, trade, governance, and knowledge systems.",
          order: 0,
          mediaType: "none",
          mediaUrl: null,
          feedbackQuestion: null,
        },
        {
          lessonId: lesson.id,
          title: "Chapter 2: Legacy",
          content:
            "Their legacies include architecture, astronomy, metallurgy, writing, and storytelling.",
          order: 1,
          mediaType: "none",
          mediaUrl: null,
          feedbackQuestion: null,
        },
      ],
    });
  }

  const quizCount = await prisma.quiz.count({
    where: { lessonId: lesson.id },
  });
  if (quizCount === 0) {
    await prisma.quiz.create({
      data: {
        lessonId: lesson.id,
        question:
          "Which region is home to many early civilizations with deep historical influence?",
        options: ["Europe", "Africa", "Antarctica", "Oceania"],
        correctOption: 1,
        explanation:
          "Africa has been home to many civilizations with lasting cultural and intellectual legacies.",
        order: 0,
        heartLimit: 4,
        timeLimitSeconds: null,
        difficulty: "easy",
        isActive: true,
        tags: ["intro", "history"],
        topicId: topic.id,
      },
    });
  }

  // ==================== CHARACTER ====================
  const character = await prisma.character.upsert({
    where: { slug: "kama-the-historian" },
    update: {
      name: "Kama the Historian",
      description:
        "A fictional guide that helps players learn African history.",
      story:
        "Kama collects stories, facts, and legends from across the continent.",
      unlockLessonId: lesson.id,
      rarityLevel: "common",
    },
    create: {
      name: "Kama the Historian",
      slug: "kama-the-historian",
      description:
        "A fictional guide that helps players learn African history.",
      story:
        "Kama collects stories, facts, and legends from across the continent.",
      imageUrl: null,
      inventionImage: null,
      xpThreshold: null,
      rarityLevel: "common",
      unlockLessonId: lesson.id,
      categories: {
        create: [
          {
            categoryId: category.id,
          },
        ],
      },
    },
  });

  const characterTranslationExisting =
    await prisma.characterTranslation.findFirst({
      where: { characterId: character.id, language: "en" },
      select: { id: true },
    });

  if (!characterTranslationExisting) {
    await prisma.characterTranslation.create({
      data: {
        characterId: character.id,
        language: "en",
        name: "Kama",
        description: "Your guide for African history.",
        story: "Kama learns and shares stories.",
      },
    });
  }

  // ==================== TEST USERS ====================
  console.log("📝 Creating test users...");

  const testUsers = [
    {
      email: "student1@kamagame.com",
      username: "student1",
      password: "Student123!",
      role: "USER",
    },
    {
      email: "student2@kamagame.com",
      username: "student2",
      password: "Student123!",
      role: "USER",
    },
    {
      email: "moderator@kamagame.com",
      username: "moderator",
      password: "Moderator123!",
      role: "MODERATOR",
    },
  ];

  for (const testUser of testUsers) {
    const passwordHash = await bcrypt.hash(testUser.password, 10);
    await prisma.user.upsert({
      where: { email: testUser.email },
      update: {},
      create: {
        email: testUser.email,
        username: testUser.username,
        passwordHash,
        role: testUser.role as any,
        emailVerified: true,
      },
    });
  }

  console.log(`✅ Created ${testUsers.length} test users`);

  // ==================== MORE LESSONS ====================
  console.log("📚 Creating more lessons...");

  const egyptCategory = await prisma.category.findUnique({
    where: { slug: "ancient-egypt" },
  });

  const lessonsData = [
    {
      title: "Ancient Egypt: The Nile Civilization",
      slug: "ancient-egypt-nile",
      description: "Discover the wonders of Egyptian civilization",
      content: "# Ancient Egypt\n\nEgypt was built on the Nile River...",
      hook: "Explore pyramids and pharaohs",
      xpReward: 25,
      categoryId: egyptCategory?.id || category.id,
      topicId: topic.id,
      published: true,
    },
    {
      title: "Mansa Musa: The Richest Man in History",
      slug: "mansa-musa-history",
      description: "The legendary Mali emperor and his pilgrimage",
      content: "# Mansa Musa\n\nOne of the wealthiest men ever...",
      hook: "Discover Mali's golden age",
      xpReward: 30,
      categoryId: category.id,
      topicId: topic.id,
      published: true,
    },
    {
      title: "Hatshepsut: Female Pharaoh",
      slug: "hatshepsut-pharaoh",
      description: "One of Egypt's greatest rulers",
      content: "# Hatshepsut\n\nHatshepsut ruled Egypt with wisdom...",
      hook: "Learn about a powerful woman leader",
      xpReward: 25,
      categoryId: egyptCategory?.id || category.id,
      topicId: topic.id,
      published: true,
    },
  ];

  const createdLessons = [];
  for (const lessonData of lessonsData) {
    const createdLesson = await prisma.lesson.upsert({
      where: { slug: lessonData.slug },
      update: {},
      create: {
        title: lessonData.title,
        slug: lessonData.slug,
        description: lessonData.description,
        content: lessonData.content,
        hook: lessonData.hook,
        xpReward: lessonData.xpReward,
        categoryId: lessonData.categoryId,
        topicId: lessonData.topicId,
        published: lessonData.published,
      },
    });
    createdLessons.push(createdLesson);
  }

  console.log(`✅ Created ${createdLessons.length} lessons`);

  // ==================== MORE QUIZZES ====================
  console.log("🎯 Creating more quizzes...");

  for (const lesson of createdLessons) {
    const existingQuiz = await prisma.quiz.findFirst({
      where: { lessonId: lesson.id },
    });

    if (!existingQuiz) {
      await prisma.quiz.createMany({
        data: [
          {
            lessonId: lesson.id,
            question: `What was the main achievement of ${lesson.title}?`,
            type: "multiple_choice",
            options: [
              "Cultural advancement",
              "Military strength",
              "Trade expansion",
              "All of the above",
            ],
            correctOption: 3,
            explanation:
              "This civilization achieved greatness across multiple fronts.",
            order: 0,
            heartLimit: 4,
            difficulty: "medium",
            isActive: true,
            tags: ["history", "multiple-choice"],
            topicId: topic.id,
          },
          {
            lessonId: lesson.id,
            question: `Is ${lesson.title} still relevant today?`,
            type: "true_false",
            options: ["True", "False"],
            correctOption: 0,
            explanation:
              "Yes, these historical lessons continue to inspire us.",
            order: 1,
            heartLimit: 3,
            difficulty: "easy",
            isActive: true,
            tags: ["reflection", "true-false"],
            topicId: topic.id,
          },
        ],
      });
    }
  }

  console.log(`✅ Created quizzes for lessons`);

  // ==================== MORE CHARACTERS ====================
  console.log("🎭 Creating more characters...");

  const charactersData = [
    {
      name: "Nefertiti",
      slug: "nefertiti-queen",
      description: "Egyptian queen known for her beauty and power",
      story: "Nefertiti was one of Egypt's most influential queens",
      entityType: "person",
      personType: "leader",
      country: "Egypt",
      rarityLevel: "rare",
    },
    {
      name: "Haile Selassie",
      slug: "haile-selassie-emperor",
      description: "Emperor of Ethiopia and pan-African icon",
      story: "Haile Selassie modernized Ethiopia and championed African unity",
      entityType: "person",
      personType: "leader",
      country: "Ethiopia",
      rarityLevel: "rare",
    },
    {
      name: "The Great Zimbabwe",
      slug: "great-zimbabwe-place",
      description: "Ancient stone city in southern Africa",
      story: "Great Zimbabwe was a thriving trade center",
      entityType: "place",
      placeType: "monument",
      country: "Zimbabwe",
      rarityLevel: "legendary",
    },
    {
      name: "Zumbi dos Palmares",
      slug: "zumbi-palmares",
      description: "Leader of Palmares, a free Black settlement in Brazil",
      story: "Zumbi led resistance against slavery",
      entityType: "person",
      personType: "activist",
      country: "Brazil",
      rarityLevel: "rare",
    },
  ];

  for (const charData of charactersData) {
    await prisma.character.upsert({
      where: { slug: charData.slug },
      update: {},
      create: {
        name: charData.name,
        slug: charData.slug,
        description: charData.description,
        story: charData.story,
        entityType: charData.entityType,
        personType: charData.personType,
        placeType: charData.placeType,
        country: charData.country,
        rarityLevel: charData.rarityLevel,
        categories: {
          create: [
            {
              categoryId: category.id,
            },
          ],
        },
      },
    });
  }

  console.log(`✅ Created ${charactersData.length} characters`);

  // ==================== ACHIEVEMENTS ====================
  console.log("🏆 Creating achievements...");

  const achievementsData = [
    {
      name: "First Lesson",
      description: "Complete your first lesson",
      xpRequired: 0,
      streakRequired: null,
    },
    {
      name: "Quiz Master",
      description: "Complete 10 quizzes",
      xpRequired: 100,
      streakRequired: null,
    },
    {
      name: "History Scholar",
      description: "Earn 500 XP",
      xpRequired: 500,
      streakRequired: null,
    },
    {
      name: "Week Warrior",
      description: "Maintain a 7-day streak",
      xpRequired: null,
      streakRequired: 7,
    },
    {
      name: "Legend",
      description: "Maintain a 30-day streak",
      xpRequired: null,
      streakRequired: 30,
    },
    {
      name: "Collector",
      description: "Collect 5 characters",
      xpRequired: 250,
      streakRequired: null,
    },
  ];

  const createdAchievements = [];
  for (const achieveData of achievementsData) {
    const achievement = await prisma.achievement.create({
      data: {
        name: achieveData.name,
        description: achieveData.description,
        xpRequired: achieveData.xpRequired,
        streakRequired: achieveData.streakRequired,
      },
    });
    createdAchievements.push(achievement);
  }

  console.log(`✅ Created ${createdAchievements.length} achievements`);

  // ==================== GAMIFICATION DATA ====================
  console.log("💗 Setting up gamification data...");

  const student1 = await prisma.user.findUnique({
    where: { email: "student1@kamagame.com" },
  });

  if (student1) {
    // Create hearts for student1
    await prisma.userHearts.upsert({
      where: { userId: student1.id },
      update: {},
      create: {
        userId: student1.id,
        hearts: 4,
        maxHearts: 5,
        lastHeartLossAt: null,
        lastRecoveredAt: null,
      },
    });

    // Create streak for student1
    await prisma.userStreak.upsert({
      where: { userId: student1.id },
      update: {},
      create: {
        userId: student1.id,
        currentStreak: 5,
        longestStreak: 12,
        freezesRemaining: 3,
        lastActivityAt: new Date(),
      },
    });

    // Add some streak check-ins
    const today = new Date();
    for (let i = 0; i < 5; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0); // Normalize to start of day

      await prisma.streakCheckIn.upsert({
        where: {
          userId_date: {
            userId: student1.id,
            date,
          },
        },
        update: {},
        create: {
          userId: student1.id,
          date,
          xpEarned: 50,
          lessonCount: 2,
          quizCount: 3,
        },
      });
    }

    // Create character progress
    const charToCollect = await prisma.character.findFirst();
    if (charToCollect) {
      await prisma.userCharacterProgress.upsert({
        where: {
          userId_characterId: {
            userId: student1.id,
            characterId: charToCollect.id,
          },
        },
        update: {},
        create: {
          userId: student1.id,
          characterId: charToCollect.id,
          favoriteLevel: 2,
          isCollected: true,
          unlockedAt: new Date(),
        },
      });
    }

    // Award some achievements
    if (createdAchievements.length > 0) {
      await prisma.userAchievement.upsert({
        where: {
          userId_achievementId: {
            userId: student1.id,
            achievementId: createdAchievements[0].id,
          },
        },
        update: {},
        create: {
          userId: student1.id,
          achievementId: createdAchievements[0].id,
        },
      });
    }

    // Add some XP
    await prisma.user.update({
      where: { id: student1.id },
      data: {
        xp: 250,
        streak: 5,
      },
    });
  }

  console.log(`✅ Set up gamification data for test user`);

  // ==================== COMPLETED LESSONS ====================
  console.log("✅ Recording completed lessons...");

  if (student1 && createdLessons.length > 0) {
    for (let i = 0; i < Math.min(2, createdLessons.length); i++) {
      await prisma.completedLesson.upsert({
        where: {
          userId_lessonId: {
            userId: student1.id,
            lessonId: createdLessons[i].id,
          },
        },
        update: {},
        create: {
          userId: student1.id,
          lessonId: createdLessons[i].id,
          xpEarned: 25,
        },
      });
    }
  }

  console.log(`✅ Recorded completed lessons`);

  // ==================== POLL DATA ====================
  console.log("📊 Creating poll quizzes...");

  const pollQuiz = await prisma.quiz.create({
    data: {
      lessonId: lesson.id,
      question: "What aspect of African history interests you most?",
      type: "poll",
      isPoll: true,
      pollDescription: "Help us understand your interests",
      options: [
        "Ancient Civilizations",
        "Modern History",
        "Culture & Arts",
        "Science & Technology",
      ],
      correctOption: null,
      order: 5,
      heartLimit: 0,
      difficulty: "easy",
      isActive: true,
      tags: ["poll", "feedback"],
      topicId: topic.id,
      pollResults: { "0": 12, "1": 8, "2": 15, "3": 5 },
      totalPollVotes: 40,
    },
  });

  console.log(`✅ Created poll quiz`);

  // ==================== BOOKMARKS ====================
  console.log("📌 Creating bookmarks...");

  if (student1 && createdLessons.length > 0) {
    await prisma.bookmark.upsert({
      where: {
        userId_lessonId: {
          userId: student1.id,
          lessonId: createdLessons[0].id,
        },
      },
      update: {},
      create: {
        userId: student1.id,
        lessonId: createdLessons[0].id,
      },
    });
  }

  console.log(`✅ Created bookmarks`);

  // ==================== DAILY CHALLENGES ====================
  console.log("🎯 Creating daily challenges...");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const challenges = [
    {
      title: "Complete 3 Lessons",
      description: "Finish 3 lessons today to earn bonus XP",
      targetCount: 3,
      rewardXp: 100,
    },
    {
      title: "Pass 5 Quizzes",
      description: "Score 100% on 5 quizzes",
      targetCount: 5,
      rewardXp: 150,
    },
    {
      title: "Maintain Streak",
      description: "Keep your learning streak alive",
      targetCount: 1,
      rewardXp: 50,
    },
    {
      title: "Explore New Category",
      description: "Learn from a new lesson category",
      targetCount: 1,
      rewardXp: 75,
    },
  ];

  for (const challengeData of challenges) {
    await prisma.dailyChallenge.create({
      data: {
        title: challengeData.title,
        description: challengeData.description,
        challengeType: "lessons_completed",
        targetCount: challengeData.targetCount,
        xpReward: challengeData.rewardXp,
        active: true,
        startDate: today,
        endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`✅ Created ${challenges.length} daily challenges`);

  // ==================== GAMING CONFIG ====================
  console.log("⚙️ Setting up gamification configuration...");

  await prisma.gameConfig.upsert({
    where: { id: "gamification" },
    update: {},
    create: {
      id: "gamification",
      heartsMaxHearts: 5,
      heartsRecoveryTimeMs: 3600000,
      heartsPremiumRecoveryTimeMs: 1800000,
      streaksCheckInHours: 24,
      streaksXpMultiplierFormula: "1 + (currentStreak / 100)",
      streaksMilestones: [7, 14, 30, 60, 100, 365],
      charactersUnlockXpThreshold: 100,
      charactersPurchaseXpCost: 50,
      gamificationEnabled: true,
      gamificationEventMultiplier: 1.0,
    },
  });

  console.log(`✅ Configured gamification system`);

  console.log("✨ Seed completed successfully!");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
