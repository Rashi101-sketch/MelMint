const { PrismaClient } = require("@prisma/client");

// Singleton pattern to prevent multiple Prisma Client instances
// during development hot-reloads (nodemon restarts)
let prisma;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ["warn", "error"],
    });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
