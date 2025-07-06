import { PrismaClient, Subject } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create sample UPSC questions
  const sampleQuestions = [
    {
      title: "Digital India Initiative",
      content: "Critically analyze the Digital India initiative and its impact on governance and citizen services. Discuss the challenges and opportunities in its implementation. (250 words)",
      subject: Subject.GENERAL_STUDIES_2,
      year: 2023,
      paper: "Mains",
      marks: 15,
      timeLimit: 20,
      keywords: ["Digital India", "e-governance", "digital divide", "cyber security", "citizen services"],
      sampleAnswer: "The Digital India initiative, launched in 2015, represents a transformative vision..."
    },
    {
      title: "Climate Change and Agriculture",
      content: "Examine the impact of climate change on Indian agriculture and suggest adaptive strategies for sustainable farming. (250 words)",
      subject: Subject.GENERAL_STUDIES_3,
      year: 2023,
      paper: "Mains",
      marks: 15,
      timeLimit: 20,
      keywords: ["climate change", "agriculture", "adaptation", "sustainable farming", "food security"],
      sampleAnswer: "Climate change poses significant challenges to Indian agriculture..."
    }
  ];

  for (const question of sampleQuestions) {
    await prisma.question.upsert({
      where: { title: question.title },
      update: {},
      create: question,
    });
  }

  console.log('Database seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
