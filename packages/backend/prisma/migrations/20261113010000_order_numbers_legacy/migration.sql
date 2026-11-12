-- Order.numbers is legacy: new lotto orders carry a Ticket instead.
ALTER TABLE "Order" ALTER COLUMN "numbers" DROP NOT NULL;
