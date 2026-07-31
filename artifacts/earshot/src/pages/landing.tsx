import { Link } from "wouter";
import heroBanner from "@assets/IMG_2590_1784058753262.jpeg";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Radio, Mic, Headphones, MessageCircle, Users, Mail, Archive } from "lucide-react";

const CONTACT_PARTS = ["cm234567", "protonmail.com"];

function openContactEmail() {
  window.location.href = `mailto:${CONTACT_PARTS.join("@")}`;
}

const features = [
  {
    icon: Headphones,
    title: "OVERHEARD SOUNDS",
    description: "Upload and share overheard sounds and audio clips with the SSF community.",
  },
  {
    icon: Mic,
    title: "SELF RECORDED SOUNDS",
    description: "Record and share your own self-recorded audio and sound files instantly.",
  },
  {
    icon: Radio,
    title: "Go Live To Share With The Community",
    description: "Broadcast live audio streams to the sex sound files community in real time.",
  },
  {
    icon: Archive,
    title: "Archives",
    description: "Browse archived sound clips and audio files from the SSF community history.",
  },
  {
    icon: MessageCircle,
    title: "Direct messages",
    description: "Chat privately with other members about sounds, audio, and shared clips.",
  },
  {
    icon: Users,
    title: "See who's around",
    description: "Discover who's online and sharing sounds right now in the SSF community.",
  },
];

export default function Landing() {
  return (
    <div className="relative min-h-[100dvh]">
      <div className="relative">
        <header className="border-b border-border/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2">
              <img src="./logo.svg" alt="SSF" className="h-9 w-9 rounded-lg" />
              <span className="text-xl font-semibold tracking-tight">SSF</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/sign-in" data-testid="link-sign-in">
                <Button variant="ghost">Log in</Button>
              </Link>
              <Link href="/sign-up" data-testid="link-sign-up">
                <Button>Sign up</Button>
              </Link>
            </div>
          </div>
        </header>

        <main>
          <section className="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center">
            <h1 className="sr-only">SSF - Sex Sound Files - Home of the Filthiest Sounds - Audio Sharing Community</h1>
            <img
              src={heroBanner}
              alt="SSF - Sex Sound Files banner - Home of the filthiest sounds"
              className="mx-auto h-[260px] w-full rounded-lg object-cover shadow-lg"
              data-testid="img-hero-banner"
              fetchPriority="high"
            />
            <p className="mx-auto mt-5 max-w-2xl text-lg font-sans font-semibold tracking-wide">
              THE HOME OF THE FILTHIEST SOUNDS. JOIN THE COMMUNITY!
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Link href="/sign-up" data-testid="link-hero-sign-up">
                <Button size="lg" className="gap-2">
                  Get started
                </Button>
              </Link>
              <Link href="/sign-in" data-testid="link-hero-sign-in">
                <Button size="lg" variant="outline">
                  I already have an account
                </Button>
              </Link>
            </div>
          </section>

          <section className="mx-auto max-w-4xl px-6 py-12 text-center">
            <h2 className="mb-4 text-xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">
              Share, Discover &amp; Enjoy the Best Sound Files Online
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              SSF - Sex Sound Files is the ultimate destination for sharing and discovering audio content. 
              Whether you're uploading overheard sounds, sharing self-recorded audio clips, going live to 
              broadcast to the community, or browsing archived sound files, SSF brings together people 
              who love sounds. Join thousands of members sharing filthy sounds, audio clips, and live 
              broadcasts every day. Upload your sounds, connect with the community, and discover the 
              best audio content on the web.
            </p>
          </section>

          <section className="mx-auto max-w-6xl px-6 pb-24">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card
                  key={feature.title}
                  className="border-[#5a1017] bg-[#3d0b10]/95 p-6 backdrop-blur-sm"
                  data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <feature.icon className="h-8 w-8 text-[#e8a3a3]" />
                  <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{feature.description}</p>
                </Card>
              ))}
            </div>
          </section>

          <section className="mx-auto max-w-2xl px-6 pb-24 text-center">
            <Card className="border-[#5a1017] bg-[#3d0b10]/95 p-8 backdrop-blur-sm">
              <Mail className="mx-auto h-8 w-8 text-[#e8a3a3]" />
              <h3 className="mt-4 text-lg font-semibold text-white">Get in touch</h3>
              <p className="mt-2 text-sm text-white/70">
                Questions, feedback, or ideas? Reach out and we'll get back to you.
              </p>
              <Button className="mt-5 gap-2" onClick={openContactEmail} data-testid="button-contact-email">
                <Mail className="h-4 w-4" />
                Contact us
              </Button>
            </Card>
          </section>
        </main>

        <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
          <p>SSF - Sex Sound Files - Home of the filthiest sounds and audio sharing community.</p>
        </footer>
      </div>
    </div>
  );
}
