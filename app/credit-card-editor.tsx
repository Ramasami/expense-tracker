"use client";
import { useState } from "react";
export type CreditCard = { id: string; name: string };
export default function CreditCardEditor({
  value = [],
}: {
  value?: CreditCard[];
}) {
  const [cards, setCards] = useState<CreditCard[]>(value);
  return (
    <fieldset className="credit-card-editor">
      <legend>Credit cards</legend>
      <p>Add the cards linked to this account.</p>
      <input type="hidden" name="creditCards" value={JSON.stringify(cards)} />
      {cards.map((card, index) => (
        <div className="credit-card-row" key={card.id}>
          <label className="field">
            Card name
            <input
              aria-label={`Credit card ${index + 1} name`}
              value={card.name}
              maxLength={120}
              required
              onChange={(event) =>
                setCards(
                  cards.map((item) =>
                    item.id === card.id
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            aria-label={`Remove credit card ${index + 1}`}
            onClick={() =>
              setCards(cards.filter((item) => item.id !== card.id))
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setCards([...cards, { id: crypto.randomUUID(), name: "" }])
        }
      >
        Add credit card
      </button>
    </fieldset>
  );
}
