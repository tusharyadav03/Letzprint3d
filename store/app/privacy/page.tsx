import { site } from "@/site.config";

export const metadata = { title: `Privacy — ${site.name}` };

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1>Privacy</h1>
      <p className="mt-6 text-ink-2">
        This site sets no cookies and runs no analytics. The only data we handle is what you send us to make your order:
        your name, a delivery address if you choose POST, your phone number or email, and the text, photo or logo for the
        lamp.
      </p>
      <p className="mt-4 text-ink-2">
        We keep that for as long as the order takes plus the legal retention period for invoices. Photos and logos are
        deleted 30 days after delivery unless you ask us to keep them for a reorder. We never publish a customer's photo.
      </p>
      <p className="mt-4 text-ink-2">
        Messages go through WhatsApp (Meta Platforms Ireland) or email; their own privacy terms apply to the transport.
        Questions or deletion requests: {site.email}. Supervisory authority: CNPD, Luxembourg.
      </p>
    </div>
  );
}
