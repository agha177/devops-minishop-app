const express = require("express");
const pool = require("./db");

const app = express();

app.use(express.json());

// Basic application health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Retrieve products from PostgreSQL
app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM products ORDER BY id"
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Database query failed:", error.message);

    res.status(500).json({
      error: "Unable to retrieve products"
    });
  }
});

app.post("/api/orders", async (req, res) => {
  const items = req.body.items;

  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.some(
      (item) =>
        !Number.isInteger(item.product_id) ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
    )
  ) {
    return res.status(400).json({
      error: "Invalid order items"
    });
  }

  // Combine duplicate product IDs.
  const quantities = new Map();

  for (const item of items) {
    quantities.set(
      item.product_id,
      (quantities.get(item.product_id) || 0) + item.quantity
    );
  }

  const client = await pool.connect().catch((error) => {
    console.error("Database connection failed:", error.message);
    return null;
  });

  if (!client) {
    return res.status(500).json({
      error: "Database unavailable"
    });
  }

  try {
    await client.query("BEGIN");

    let totalCents = 0;
    const orderItems = [];

    // Lock products in a consistent order to reduce deadlock risk.
    const productIds = [...quantities.keys()].sort((a, b) => a - b);

    for (const productId of productIds) {
      const quantity = quantities.get(productId);

      if (!Number.isSafeInteger(quantity)) {
        const error = new Error("Invalid quantity");
        error.status = 400;
        throw error;
      }

      const result = await client.query(
        "SELECT id, price, stock FROM products WHERE id = $1 FOR UPDATE",
        [productId]
      );

      if (result.rows.length === 0) {
        const error = new Error(`Product ${productId} not found`);
        error.status = 400;
        throw error;
      }

      const product = result.rows[0];

      if (product.stock < quantity) {
        const error = new Error(`Insufficient stock for product ${productId}`);
        error.status = 409;
        throw error;
      }

      const priceCents = Math.round(Number(product.price) * 100);
      totalCents += priceCents * quantity;

      orderItems.push({
        productId,
        quantity,
        priceCents
      });
    }

    if (!Number.isSafeInteger(totalCents)) {
      const error = new Error("Order total is too large");
      error.status = 400;
      throw error;
    }

    const total = (totalCents / 100).toFixed(2);

    const orderResult = await client.query(
      "INSERT INTO orders (total) VALUES ($1) RETURNING id",
      [total]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [
          orderId,
          item.productId,
          item.quantity,
          (item.priceCents / 100).toFixed(2)
        ]
      );

      await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2",
        [item.quantity, item.productId]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Order created successfully",
      order_id: orderId,
      total
    });
  } catch (error) {
    await client.query("ROLLBACK").catch((rollbackError) => {
      console.error("Rollback failed:", rollbackError.message);
    });

    if (!error.status) {
      console.error("Order creation failed:", error.message);
    }

    res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to create order"
    });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MiniShop backend listening on port ${PORT}`);
  });
}

module.exports = app;
