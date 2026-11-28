
import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);

  // Fetch products from the backend API
  useEffect(() => {
    fetch("/api/products")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch products");
        }
        return response.json();
      })
      .then((data) => setProducts(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Add a product to the shopping cart
  function addToCart(product) {
    const quantityInCart = cart.filter(
      (item) => item.id === product.id
    ).length;

    if (quantityInCart >= product.stock) {
      setCheckoutMessage("Not enough stock available");
      return;
    }

    setCart((previous) => [...previous, product]);
    setCheckoutMessage("");
  }

  // Remove one occurrence of a product from the cart
  function removeFromCart(productId) {
    setCart((previous) => {
      const index = previous.findIndex(
        (item) => item.id === productId
      );

      if (index === -1) return previous;

      return previous.filter((_, i) => i !== index);
    });
  }

  // Calculate the total cart price
  const total = cart.reduce(
    (sum, product) => sum + Number(product.price),
    0
  );

  // Send the order to the backend
  async function checkout() {
    if (cart.length === 0 || checkingOut) return;

    setCheckingOut(true);
    setCheckoutMessage("");

    // Group duplicate products into quantities
    const quantities = {};

    for (const product of cart) {
      quantities[product.id] =
        (quantities[product.id] || 0) + 1;
    }

    const items = Object.entries(quantities).map(
      ([productId, quantity]) => ({
        product_id: Number(productId),
        quantity,
      })
    );

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Checkout failed");
      }

      setCheckoutMessage(
        `Order #${data.order_id} placed successfully!`
      );

      // Clear the shopping cart
      setCart([]);

      // Refresh products to display updated stock
      const productsResponse = await fetch("/api/products");

      if (productsResponse.ok) {
        setProducts(await productsResponse.json());
      }
    } catch (err) {
      setCheckoutMessage(err.message);
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="container">
      <header>
        <h1>MiniShop v2</h1>
        <p>Powered by Jenkins, AWS ECR and Argo CD</p>

        <div className="cart-count">
          Cart: {cart.length} items
        </div>
      </header>

      <main>
        <h2>Our Products</h2>

        {loading && <p>Loading products...</p>}

        {error && <p className="error">{error}</p>}

        <div className="products">
          {products.map((product) => {
            const quantityInCart = cart.filter(
              (item) => item.id === product.id
            ).length;

            return (
              <div className="product-card" key={product.id}>
                <h3>{product.name}</h3>

                <p>{product.description}</p>

                <p className="price">
                  {Number(product.price).toFixed(2)} EGP
                </p>

                <p>In stock: {product.stock}</p>

                <button
                  onClick={() => addToCart(product)}
                  disabled={
                    checkingOut ||
                    quantityInCart >= product.stock
                  }
                >
                  Add to Cart
                </button>
              </div>
            );
          })}
        </div>

        <section className="cart">
          <h2>Shopping Cart</h2>

          {cart.length === 0 ? (
            <p>Your cart is empty.</p>
          ) : (
            <div>
              {Object.values(
                cart.reduce((grouped, product) => {
                  if (!grouped[product.id]) {
                    grouped[product.id] = {
                      ...product,
                      quantity: 0,
                    };
                  }

                  grouped[product.id].quantity += 1;
                  return grouped;
                }, {})
              ).map((item) => (
                <div key={item.id} className="cart-item">
                  <span>
                    {item.name} × {item.quantity}
                  </span>

                  <button
                    onClick={() => removeFromCart(item.id)}
                    disabled={checkingOut}
                  >
                    Remove One
                  </button>
                </div>
              ))}
            </div>
          )}

          <p>Items: {cart.length}</p>

          <h3>Total: {total.toFixed(2)} EGP</h3>

          <button
            onClick={checkout}
            disabled={cart.length === 0 || checkingOut}
          >
            {checkingOut ? "Processing..." : "Checkout"}
          </button>

          {checkoutMessage && (
            <p className="checkout-message">
              {checkoutMessage}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;

