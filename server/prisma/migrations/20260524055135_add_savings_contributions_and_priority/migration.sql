-- AlterTable
ALTER TABLE `cycles` ADD COLUMN `cycle_notes` TEXT NULL;

-- AlterTable
ALTER TABLE `savings_goals` ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `savings_contributions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `amount` DECIMAL(12, 2) NOT NULL,
    `source` VARCHAR(50) NOT NULL DEFAULT 'salary_allocation',
    `note` VARCHAR(255) NULL,
    `goal_id` INTEGER NOT NULL,
    `cycle_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `savings_contributions_goal_id_idx`(`goal_id`),
    INDEX `savings_contributions_cycle_id_idx`(`cycle_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `savings_contributions` ADD CONSTRAINT `savings_contributions_goal_id_fkey` FOREIGN KEY (`goal_id`) REFERENCES `savings_goals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `savings_contributions` ADD CONSTRAINT `savings_contributions_cycle_id_fkey` FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
