/** Logotipo oficial da Domma Tecnologia (arquivos em /public), com o selo do produto. */
export function Logo({ dark = false, size = "md" }: { dark?: boolean; size?: "md" | "lg" }) {
  const h = size === "lg" ? "h-10" : "h-6";
  return (
    <span className="logo-shine items-center gap-2 rounded-md" aria-label="Domma CRM">
      <img src={dark ? "/logo-dark.png" : "/logo-light.png"} alt="Domma Tecnologia" className={`${h} w-auto`} />
      <span className="crm-pill rounded-[5px] px-1.5 py-px text-[10px] font-bold tracking-wide">CRM</span>
    </span>
  );
}
