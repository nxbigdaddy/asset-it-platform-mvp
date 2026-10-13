import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const categories = await p.assetCategory.findMany();
const subnets = await p.subnet.findMany();
console.log(JSON.stringify({ categories, subnets }, null, 2));
await p.$disconnect();
