import { site } from "@/site.config";

export const metadata = { title: `Legal notice — ${site.name}` };

// TODO before going public: fill in the identity of the registered seller (Luxembourg e-commerce law requires it).
export default function Legal() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1>Legal notice</h1>
      <p className="mt-2 text-ink-3">Mentions légales</p>
      <dl className="mt-8 grid gap-4 text-ink-2">
        <div>
          <dt className="text-ink">Operator</dt>
          <dd>[Legal name of the seller — to be completed]</dd>
        </div>
        <div>
          <dt className="text-ink">Address</dt>
          <dd>[Street, postcode, {site.city}]</dd>
        </div>
        <div>
          <dt className="text-ink">Business permit</dt>
          <dd>[Autorisation d'établissement n° — to be completed]</dd>
        </div>
        <div>
          <dt className="text-ink">Trade register / VAT</dt>
          <dd>[RCS — / VAT — or “VAT not applicable, small-business franchise (art. 57 LTVA)”]</dd>
        </div>
        <div>
          <dt className="text-ink">Contact</dt>
          <dd>{site.email}</dd>
        </div>
      </dl>
      <h2 className="mt-12">Orders and withdrawal</h2>
      <p className="mt-4 text-ink-2">
        Orders are placed by message (WhatsApp or email) and confirmed by us with the final price and delivery date. Payment
        by bank transfer or Payconiq on confirmation; cash on pick-up.
      </p>
      <p className="mt-4 text-ink-2">
        Lamps and stands made to your specification — your text, photo, logo or chosen combination — are personalised
        goods: under Article L. 222-9 (7) of the Luxembourg Consumer Code the 14-day right of withdrawal does not apply
        once production has started. For non-personalised items you have 14 days from delivery to withdraw.
      </p>
      <p className="mt-4 text-ink-2">
        Defective prints are replaced or refunded. Statutory warranty applies.
      </p>
    </div>
  );
}
