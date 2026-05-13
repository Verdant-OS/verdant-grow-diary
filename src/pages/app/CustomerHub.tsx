import { Link } from "react-router-dom";
import { PageHeader } from "@/components/ui-bits";
import { Users, ExternalLink, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

const guides = [
  { slug: "og-kush-auto", name: "OG Kush Auto" },
  { slug: "sour-diesel-auto", name: "Sour Diesel Auto" },
];

export default function CustomerHub() {
  return (
    <>
      <PageHeader title="Customer Mode" subtitle="Lightweight QR-driven grow guides for your customers" icon={Users}
        actions={<Button asChild variant="outline"><Link to="/grow" target="_blank"><ExternalLink className="h-4 w-4 mr-1.5" />Open customer site</Link></Button>} />

      <div className="glass rounded-xl p-5 mb-4 border-info/30">
        <p className="text-sm">
          Customer Mode is a separate, branded experience. It never has access to your operator diary.
          Use it for QR-printed strain guides, education, opt-ins, and photo checkups.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {guides.map(g => (
          <div key={g.slug} className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-display font-semibold text-lg">{g.name}</div>
                <div className="text-xs text-muted-foreground">Strain QR landing page</div>
              </div>
              <QrCode className="h-8 w-8 text-primary" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to={`/grow/${g.slug}`} target="_blank">Preview</Link></Button>
              <Button asChild variant="ghost" size="sm"><Link to="/app/customer/sms">SMS opt-ins</Link></Button>
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-xl p-5 mt-4">
        <h3 className="font-display font-semibold mb-2">SMS reminder opt-ins</h3>
        <p className="text-sm text-muted-foreground mb-3">Collect express consent before sending. Verdant does not yet send real SMS.</p>
        <Button asChild className="gradient-leaf text-primary-foreground"><Link to="/app/customer/sms">Manage opt-ins</Link></Button>
      </div>
    </>
  );
}
