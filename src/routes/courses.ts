import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { notifyNewCourse } from "../services/notifications.js";

export const coursesRouter = Router();

// List all courses
coursesRouter.get("/", async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    let courses;

    if (lat && lng && radius) {
      // Simple bounding box filter for nearby courses
      const latNum = parseFloat(lat as string);
      const lngNum = parseFloat(lng as string);
      const radiusDeg = parseFloat(radius as string) / 111; // ~111km per degree
      courses = await prisma.course.findMany({
        where: {
          latitude: { gte: latNum - radiusDeg, lte: latNum + radiusDeg },
          longitude: { gte: lngNum - radiusDeg, lte: lngNum + radiusDeg },
        },
      });
    } else {
      courses = await prisma.course.findMany();
    }

    res.json(courses);
  } catch (error) {
    console.error("Fetch courses error:", error);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

// Get course detail with holes
coursesRouter.get("/:id", async (req, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        courseHoles: { orderBy: { number: "asc" } },
      },
    });
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(course);
  } catch {
    res.status(500).json({ error: "Failed to fetch course" });
  }
});

// Create course
coursesRouter.post("/", async (req, res) => {
  try {
    const { name, city, country, latitude, longitude, holes, par, courseHoles } = req.body;
    const course = await prisma.course.create({
      data: {
        name,
        city,
        country,
        latitude,
        longitude,
        holes: holes || 18,
        par,
        courseHoles: courseHoles
          ? { create: courseHoles }
          : undefined,
      },
      include: { courseHoles: true },
    });
    // Notify all users about the new course (non-blocking)
    notifyNewCourse(course.name, course.city).catch(() => {});

    res.status(201).json(course);
  } catch {
    res.status(500).json({ error: "Failed to create course" });
  }
});
