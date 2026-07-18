import { SiteHeader } from "@/components/site/SiteHeader";
import { Hero } from "@/components/site/Hero";
import { Services } from "@/components/site/Services";
import { Process } from "@/components/site/Process";
import { About } from "@/components/site/About";
import { Proof } from "@/components/site/Proof";
import { Contact } from "@/components/site/Contact";
import { SiteFooter } from "@/components/site/Footer";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Services />
        <Process />
        <About />
        <Proof />
        <Contact />
      </main>
      <SiteFooter />
    </>
  );
}
