-- Add publicKey to User
ALTER TABLE "User" ADD COLUMN "publicKey" TEXT;

-- Add audioDuration to Message
ALTER TABLE "Message" ADD COLUMN "audioDuration" INTEGER;

-- Add url to Recipe
ALTER TABLE "Recipe" ADD COLUMN "url" TEXT;

-- Add assigneeId to Task
ALTER TABLE "Task" ADD COLUMN "assigneeId" TEXT;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create ChatKey table
CREATE TABLE "ChatKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ChatKey_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChatKey_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create unique constraint on ChatKey
CREATE UNIQUE INDEX "ChatKey_chatId_userId_key" ON "ChatKey"("chatId", "userId");
