import React from "react";

export interface PayPalButtonProps {
  className?: string;
}

export const PayPalButton: React.FC<PayPalButtonProps> = ({ className = "" }) => {
  return (
    <div id="paypal-payment-container" className={`inline-flex items-center ${className}`}>
      <style>{`
        .pp-ATGFXU4FTE2NA {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          border: 1px solid rgba(217, 119, 6, 0.3);
          border-radius: 0.5rem;
          min-width: 7.5rem;
          padding: 0 0.75rem;
          height: 30px;
          box-sizing: border-box;
          font-weight: 600;
          background-color: #FFD140;
          color: #000000;
          font-family: inherit;
          font-size: 0.75rem;
          line-height: 1rem;
          cursor: pointer;
          transition: transform 0.1s ease, filter 0.15s ease;
        }
        .pp-ATGFXU4FTE2NA:hover {
          filter: brightness(0.95);
        }
        .pp-ATGFXU4FTE2NA:active {
          transform: scale(0.98);
        }
      `}</style>
      <form
        action="https://www.paypal.com/ncp/payment/ATGFXU4FTE2NA"
        method="post"
        target="_blank"
        className="flex items-center gap-1.5 m-0 p-0"
      >
        <input
          id="paypal-submit-btn"
          className="pp-ATGFXU4FTE2NA"
          type="submit"
          value="Pay for usage"
        />
        <section
          className="text-zinc-400 flex items-center justify-center m-0 p-0"
          title="PayPal"
        >
          <img
            src="https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-wordmark-color.svg"
            alt="paypal"
            style={{ height: "0.875rem", verticalAlign: "middle" }}
            referrerPolicy="no-referrer"
          />
        </section>
      </form>
    </div>
  );
};

export default PayPalButton;
