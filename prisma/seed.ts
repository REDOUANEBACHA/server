import { PrismaClient } from "@prisma/client";
//test
const prisma = new PrismaClient();

const courses = [
  {
    name: "Golf National - Albatros",
    city: "Saint-Quentin-en-Yvelines",
    country: "France",
    latitude: 48.7545,
    longitude: 2.0735,
    holes: 18,
    par: 72,
    courseHoles: [
      { number: 1, par: 4, distance: 380 },
      { number: 2, par: 4, distance: 410 },
      { number: 3, par: 3, distance: 175 },
      { number: 4, par: 5, distance: 520 },
      { number: 5, par: 4, distance: 390 },
      { number: 6, par: 4, distance: 415 },
      { number: 7, par: 3, distance: 185 },
      { number: 8, par: 4, distance: 370 },
      { number: 9, par: 5, distance: 540 },
      { number: 10, par: 4, distance: 395 },
      { number: 11, par: 3, distance: 165 },
      { number: 12, par: 4, distance: 420 },
      { number: 13, par: 4, distance: 385 },
      { number: 14, par: 5, distance: 510 },
      { number: 15, par: 4, distance: 400 },
      { number: 16, par: 3, distance: 190 },
      { number: 17, par: 4, distance: 430 },
      { number: 18, par: 5, distance: 530 },
    ],
  },
  {
    name: "Golf de Morfontaine",
    city: "Mortefontaine",
    country: "France",
    latitude: 49.1375,
    longitude: 2.6103,
    holes: 18,
    par: 70,
    courseHoles: [
      { number: 1, par: 4, distance: 365 },
      { number: 2, par: 3, distance: 155 },
      { number: 3, par: 4, distance: 340 },
      { number: 4, par: 4, distance: 400 },
      { number: 5, par: 5, distance: 490 },
      { number: 6, par: 3, distance: 180 },
      { number: 7, par: 4, distance: 375 },
      { number: 8, par: 4, distance: 350 },
      { number: 9, par: 4, distance: 390 },
      { number: 10, par: 4, distance: 370 },
      { number: 11, par: 3, distance: 160 },
      { number: 12, par: 4, distance: 410 },
      { number: 13, par: 5, distance: 505 },
      { number: 14, par: 4, distance: 380 },
      { number: 15, par: 3, distance: 170 },
      { number: 16, par: 4, distance: 395 },
      { number: 17, par: 4, distance: 345 },
      { number: 18, par: 4, distance: 420 },
    ],
  },
  {
    name: "Golf du Médoc - Les Châteaux",
    city: "Le Pian-Médoc",
    country: "France",
    latitude: 44.9283,
    longitude: -0.7085,
    holes: 18,
    par: 72,
    courseHoles: [
      { number: 1, par: 4, distance: 375 },
      { number: 2, par: 5, distance: 515 },
      { number: 3, par: 3, distance: 170 },
      { number: 4, par: 4, distance: 390 },
      { number: 5, par: 4, distance: 360 },
      { number: 6, par: 4, distance: 405 },
      { number: 7, par: 3, distance: 185 },
      { number: 8, par: 5, distance: 530 },
      { number: 9, par: 4, distance: 400 },
      { number: 10, par: 4, distance: 385 },
      { number: 11, par: 3, distance: 160 },
      { number: 12, par: 4, distance: 415 },
      { number: 13, par: 5, distance: 520 },
      { number: 14, par: 4, distance: 370 },
      { number: 15, par: 4, distance: 395 },
      { number: 16, par: 3, distance: 175 },
      { number: 17, par: 4, distance: 410 },
      { number: 18, par: 5, distance: 540 },
    ],
  },
  {
    name: "Royal Golf Dar Es Salam",
    city: "Rabat",
    country: "Maroc",
    latitude: 33.9566,
    longitude: -6.8722,
    holes: 18,
    par: 73,
    courseHoles: [
      { number: 1, par: 5, distance: 530 },
      { number: 2, par: 4, distance: 385 },
      { number: 3, par: 3, distance: 190 },
      { number: 4, par: 4, distance: 410 },
      { number: 5, par: 4, distance: 370 },
      { number: 6, par: 5, distance: 545 },
      { number: 7, par: 3, distance: 175 },
      { number: 8, par: 4, distance: 400 },
      { number: 9, par: 4, distance: 395 },
      { number: 10, par: 4, distance: 380 },
      { number: 11, par: 3, distance: 165 },
      { number: 12, par: 5, distance: 510 },
      { number: 13, par: 4, distance: 420 },
      { number: 14, par: 4, distance: 375 },
      { number: 15, par: 3, distance: 180 },
      { number: 16, par: 4, distance: 405 },
      { number: 17, par: 5, distance: 525 },
      { number: 18, par: 4, distance: 440 },
    ],
  },
  {
    name: "Golf de Palmeraie Marrakech",
    city: "Marrakech",
    country: "Maroc",
    latitude: 31.6647,
    longitude: -7.9753,
    holes: 18,
    par: 72,
    courseHoles: [
      { number: 1, par: 4, distance: 365 },
      { number: 2, par: 4, distance: 390 },
      { number: 3, par: 3, distance: 155 },
      { number: 4, par: 5, distance: 500 },
      { number: 5, par: 4, distance: 380 },
      { number: 6, par: 4, distance: 410 },
      { number: 7, par: 3, distance: 170 },
      { number: 8, par: 5, distance: 520 },
      { number: 9, par: 4, distance: 395 },
      { number: 10, par: 4, distance: 375 },
      { number: 11, par: 3, distance: 160 },
      { number: 12, par: 4, distance: 400 },
      { number: 13, par: 5, distance: 515 },
      { number: 14, par: 4, distance: 385 },
      { number: 15, par: 4, distance: 405 },
      { number: 16, par: 3, distance: 175 },
      { number: 17, par: 4, distance: 420 },
      { number: 18, par: 5, distance: 535 },
    ],
  },
];

async function main() {
  console.log("Cleaning database...");
  await prisma.holeScore.deleteMany();
  await prisma.round.deleteMany();
  await prisma.courseHole.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  console.log("Seeding database...");

  // Default user
  const user = await prisma.user.create({
    data: {
      name: "Redouane",
      email: "redouane@golf.com",
      handicap: 28.0,
    },
  });
  console.log(`  Created user: ${user.name} (${user.email})`);

  for (const courseData of courses) {
    const { courseHoles, ...course } = courseData;
    await prisma.course.create({
      data: {
        ...course,
        courseHoles: { create: courseHoles },
      },
    });
    console.log(`  Created course: ${course.name}`);
  }

  console.log("Seeding complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
