import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const HACCP_POINTS = [
  { id:"CCP1", label:"Réception matières premières", category:"Réception", limit:"T° ≤ 4°C (réfrigéré) / ≤ -18°C (congelé)", actions:["Mesure T° à réception","Contrôle aspect visuel & odeur","Vérification DLC/DDM","Refus si non-conforme"], freq:"À chaque livraison", status:"ok" },
  { id:"CCP2", label:"Stockage réfrigéré", category:"Stockage", limit:"T° entre 0°C et +4°C en continu", actions:["Relevé T° 2x/jour","Calibration sonde mensuelle","Séparation crus/cuits","FIFO obligatoire"], freq:"2x par jour", status:"warn" },
  { id:"CCP3", label:"Stockage congélation", category:"Stockage", limit:"T° ≤ -18°C en continu", actions:["Relevé T° quotidien","Pas de re-congélation","Étiquetage date de congélation"], freq:"1x par jour", status:"ok" },
  { id:"CCP4", label:"Cuisson", category:"Cuisson", limit:"T° à cœur ≥ 63°C (volaille ≥ 75°C)", actions:["Sonde à cœur obligatoire","Enregistrement T° et durée","Contrôle visuel cuisson"], freq:"À chaque cuisson", status:"ok" },
  { id:"CCP5", label:"Refroidissement rapide", category:"Cuisson", limit:"De +63°C à +10°C en moins de 2h", actions:["Cellule de refroidissement","Suivi courbe température","Enregistrement horodaté"], freq:"À chaque refroidissement", status:"ok" },
  { id:"CCP6", label:"Remise en température", category:"Service", limit:"T° à cœur ≥ 63°C en moins de 1h", actions:["Sonde à cœur obligatoire","Temps de remise en T° ≤ 1h","Pas de deuxième remise en T°"], freq:"À chaque service", status:"ok" },
  { id:"CCP7", label:"Maintien en température chaude", category:"Service", limit:"T° ≥ 63°C en permanence", actions:["Contrôle bain-marie","Relevé T° toutes les 2h","Élimination si T° < 63°C > 30min"], freq:"Toutes les 2h", status:"bad" },
]

const CHECKLIST_ITEMS = {
  ouverture: [
    { id:"o1", label:"Relevé températures frigos et congélateurs", ccp:true },
    { id:"o2", label:"Vérification dates de péremption (DLC/DDM)", ccp:true },
    { id:"o3", label:"Nettoyage et désinfection des plans de travail", ccp:false },
    { id:"o4", label:"Vérification état de propreté des équipements", ccp:false },
    { id:"o5", label:"Contrôle hygiène du personnel (tenues, mains)", ccp:false },
    { id:"o6", label:"Réapprovisionnement savon/essuie-mains", ccp:false },
  ],
  service: [
    { id:"s1", label:"Contrôle T° maintien en chaud (≥ 63°C)", ccp:true },
    { id:"s2", label:"Vérification vitrine réfrigérée (≤ 4°C)", ccp:true },
    { id:"s3", label:"Lavage mains après chaque manipulation", ccp:false },
    { id:"s4", label:"Changement de gants entre tâches différentes", ccp:false },
    { id:"s5", label:"Nettoyage surface toutes les 2h", ccp:false },
    { id:"s6", label:"Contrôle allergènes affichés et à jour", ccp:false },
  ],
  fermeture: [
    { id:"f1", label:"Relevé températures finales frigos", ccp:true },
    { id:"f2", label:"Élimination produits non conformes", ccp:true },
    { id:"f3", label:"Nettoyage complet cuisine et équipements", ccp:false },
    { id:"f4", label:"Désinfection surfaces de contact alimentaire", ccp:false },
    { id:"f5", label:"Nettoyage sol et évacuations", ccp:false },
    { id:"f6", label:"Sortie poubelles et nettoyage zone déchets", ccp:false },
  ],
}

const ALLERGENS = [
  { id:1, name:"Gluten", icon:"🌾", examples:"Blé, seigle, orge, avoine" },
  { id:2, name:"Crustacés", icon:"🦐", examples:"Crevettes, homard, crabe" },
  { id:3, name:"Œufs", icon:"🥚", examples:"Tous les types d'œufs" },
  { id:4, name:"Poissons", icon:"🐟", examples:"Tous les poissons" },
  { id:5, name:"Arachides", icon:"🥜", examples:"Cacahuètes, huile d'arachide" },
  { id:6, name:"Soja", icon:"🫘", examples:"Fèves, tofu, lécithine" },
  { id:7, name:"Lait", icon:"🥛", examples:"Fromage, beurre, crème" },
  { id:8, name:"Fruits à coque", icon:"🌰", examples:"Noix, amandes, noisettes" },
  { id:9, name:"Céleri", icon:"🌿", examples:"Céleri rave, branche" },
  { id:10, name:"Moutarde", icon:"🌻", examples:"Graines, huile, poudre" },
  { id:11, name:"Sésame", icon:"🌱", examples:"Graines, huile, tahini" },
  { id:12, name:"Sulfites", icon:"🍷", examples:"Vin, vinaigre, fruits séchés" },
  { id:13, name:"Lupin", icon:"🌼", examples:"Farine de lupin" },
  { id:14, name:"Mollusques", icon:"🐚", examples:"Huîtres, moules, coquilles" },
]

const REGLEMENTS = [
  { id:"r1", titre:"Paquet Hygiène européen", ref:"CE n°852/2004", desc:"Règlement de base sur l'hygiène des denrées alimentaires. Impose la mise en place d'un système HACCP.", categorie:"HACCP", priorite:"haute" },
  { id:"r2", titre:"Information allergènes", ref:"UE n°1169/2011", desc:"Obligation d'informer les consommateurs sur les 14 allergènes majeurs. Affichage obligatoire en restauration.", categorie:"Allergènes", priorite:"haute" },
  { id:"r3", titre:"Arrêté hygiène restauration", ref:"Arrêté 21/12/2009", desc:"Règles spécifiques d'hygiène applicables aux commerces de détail et à la restauration commerciale en France.", categorie:"Hygiène", priorite:"haute" },
  { id:"r4", titre:"Formation hygiène obligatoire", ref:"Art. L233-4 Code rural", desc:"Au moins un employé par établissement doit justifier d'une formation en hygiène alimentaire de 14h minimum.", categorie:"Formation", priorite:"haute" },
  { id:"r5", titre:"Températures réglementaires", ref:"Arrêté 29/09/1997", desc:"Définit les températures légales : +4°C max (réfrigéré), -18°C max (congelé), +63°C min (chaud).", categorie:"HACCP", priorite:"haute" },
  { id:"r6", titre:"Déclaration auprès de la DDPP", ref:"Art. R233-4", desc:"Tout établissement de restauration doit se déclarer auprès de la Direction Départementale de la Protection des Populations.", categorie:"Administration", priorite:"moyenne" },
]

const TEMPERATURES = [
  { zone:"Frigo 1", val:8, max:4, type:"froid" },
  { zone:"Frigo 2", val:3, max:4, type:"froid" },
  { zone:"Congélateur", val:-19, max:-18, type:"froid" },
  { zone:"Vitrine", val:3.5, max:4, type:"froid" },
  { zone:"Bain-marie 1", val:61, min:63, type:"chaud" },
  { zone:"Bain-marie 2", val:68, min:63, type:"chaud" },
]

const PLANS = [
  { id:"trial", label:"Essai gratuit", price:"0€", color:"#888" },
  { id:"starter", label:"Starter", price:"29€/mois", color:"#185FA5" },
  { id:"pro", label:"Pro", price:"59€/mois", color:"#0F6E56" },
  { id:"multi", label:"Multi-sites", price:"149€/mois", color:"#534AB7" },
]

const ST = {
  ok: { color:"#0F6E56", bg:"#E1F5EE", label:"Conforme" },
  warn: { color:"#BA7517", bg:"#FAEEDA", label:"Attention" },
  bad: { color:"#A32D2D", bg:"#FCEBEB", label:"Non conforme" }
}

const tempStatus = (t) => {
  if (t.type === "froid") return t.val > t.max ? "bad" : t.val > t.max - 1 ? "warn" : "ok"
  return t.val < t.min ? "bad" : t.val < t.min + 3 ? "warn" : "ok"
}

const Tag = ({ children, color = "green" }) => {
  const c = { green:{bg:"#E1F5EE",text:"#085041"}, amber:{bg:"#FAEEDA",text:"#412402"}, red:{bg:"#FCEBEB",text:"#501313"}, blue:{bg:"#E6F1FB",text:"#042C53"}, purple:{bg:"#EEEDFE",text:"#26215C"}, gray:{bg:"#F1EFE8",text:"#2C2C2A"} }[color] || {bg:"#E1F5EE",text:"#085041"}
  return <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:c.bg,color:c.text}}>{children}</span>
}

function SuperAdmin({ session, onLogout }) {
  const [page, setPage] = useState("dashboard")
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ name:"", email:"", phone:"", address:"", plan:"trial" })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")

  useEffect(() => { loadTenants() }, [])

  const loadTenants = async () => {
    setLoading(true)
    const { data } = await supabase.from("tenants").select("*").order("created_at", { ascending:false })
    setTenants(data || [])
    setLoading(false)
  }

  const createClient = async () => {
    if (!newClient.name || !newClient.email) { setMsg("Nom et email obligatoires"); return }
    setSaving(true)
    const slug = newClient.name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"") + "-" + Date.now()
    const { error } = await supabase.from("tenants").insert([{ name:newClient.name, email:newClient.email, phone:newClient.phone, address:newClient.address, plan:newClient.plan, slug, is_active:true }])
    if (error) setMsg("Erreur : " + error.message)
    else { setMsg("✅ Client créé !"); setNewClient({name:"",email:"",phone:"",address:"",plan:"trial"}); setShowNewClient(false); loadTenants() }
    setSaving(false)
  }

  const toggleActive = async (id, current) => {
    await supabase.from("tenants").update({ is_active: !current }).eq("id", id)
    loadTenants()
  }

  const planColor = (plan) => ({ trial:"gray", starter:"blue", pro:"green", multi:"purple", enterprise:"purple" }[plan] || "gray")

  const NAV = [{id:"dashboard",label:"📊 Dashboard"},{id:"clients",label:"🏪 Clients"},{id:"stats",label:"📈 Stats"}]

  return (
    <div style={{fontFamily:"'DM Sans','Trebuchet MS',sans-serif",minHeight:"100vh",background:"#FAFAF8"}}>
      <div style={{background:"#1D9E75",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,background:"rgba(255,255,255,0.2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🛡️</div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#fff"}}>SnackSafe Admin</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>Super-administrateur</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:12,color:"rgba(255,255,255,0.8)"}}>{session.user.email}</span>
          <button onClick={onLogout} style={{fontSize:11,padding:"6px 14px",background:"rgba(255,255,255,0.15)",color:"#fff",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,cursor:"pointer",fontFamily:"inherit"}}>Déconnexion</button>
        </div>
      </div>

      <div style={{background:"#fff",borderBottom:"0.5px solid #E8E8E4",display:"flex",padding:"0 24px"}}>
        {NAV.map(n => <button key={n.id} onClick={()=>setPage(n.id)} style={{padding:"14px 20px",border:"none",borderBottom:page===n.id?"2px solid #1D9E75":"2px solid transparent",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:page===n.id?600:400,color:page===n.id?"#1D9E75":"#666"}}>{n.label}</button>)}
      </div>

      <div style={{padding:24,maxWidth:1000,margin:"0 auto"}}>
        {page === "dashboard" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
              {[
                {label:"Total clients",val:tenants.length,icon:"🏪",color:"#0F6E56",bg:"#E1F5EE"},
                {label:"Clients actifs",val:tenants.filter(t=>t.is_active).length,icon:"✅",color:"#185FA5",bg:"#E6F1FB"},
                {label:"Abonnés payants",val:tenants.filter(t=>t.plan!=="trial").length,icon:"💳",color:"#534AB7",bg:"#EEEDFE"},
                {label:"En essai gratuit",val:tenants.filter(t=>t.plan==="trial").length,icon:"⏳",color:"#BA7517",bg:"#FAEEDA"},
              ].map((k,i) => <div key={i} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"16px 20px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:11,color:"#888",marginBottom:8}}>{k.label}</div>
                    <div style={{fontSize:32,fontWeight:700,color:k.color}}>{k.val}</div>
                  </div>
                  <div style={{width:40,height:40,background:k.bg,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{k.icon}</div>
                </div>
              </div>)}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16}}>
              <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#222"}}>Derniers clients</div>
                  <button onClick={()=>setPage("clients")} style={{fontSize:12,color:"#1D9E75",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Voir tous →</button>
                </div>
                {loading ? <div style={{color:"#888",fontSize:13}}>Chargement...</div> :
                  tenants.length === 0 ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Aucun client pour l'instant</div> :
                  tenants.slice(0,5).map(t => <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"0.5px solid #F0F0EC"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:34,height:34,background:"#E1F5EE",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🏪</div>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{t.name}</div>
                        <div style={{fontSize:11,color:"#888"}}>{t.email}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <Tag color={planColor(t.plan)}>{t.plan}</Tag>
                      <div style={{width:8,height:8,borderRadius:"50%",background:t.is_active?"#1D9E75":"#E24B4A"}}/>
                    </div>
                  </div>)
                }
              </div>

              <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:20}}>
                <div style={{fontSize:14,fontWeight:600,color:"#222",marginBottom:16}}>Répartition plans</div>
                {PLANS.map(p => {
                  const count = tenants.filter(t=>t.plan===p.id).length
                  const pct = tenants.length ? Math.round((count/tenants.length)*100) : 0
                  return <div key={p.id} style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:"#444"}}>{p.label}</span>
                      <span style={{fontSize:12,fontWeight:600,color:"#222"}}>{count}</span>
                    </div>
                    <div style={{height:6,background:"#F0F0EC",borderRadius:3}}>
                      <div style={{height:"100%",background:p.color,borderRadius:3,width:`${pct}%`}}/>
                    </div>
                  </div>
                })}
              </div>
            </div>
          </div>
        )}

        {page === "clients" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700,color:"#222"}}>Clients ({tenants.length})</div>
              <button onClick={()=>setShowNewClient(true)} style={{padding:"10px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>+ Nouveau client</button>
            </div>

            {msg && <div style={{padding:"10px 16px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:16,fontSize:13}}>{msg}</div>}

            {showNewClient && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:20,marginBottom:20}}>
              <div style={{fontSize:14,fontWeight:600,color:"#222",marginBottom:16}}>Nouveau client</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                {[{key:"name",label:"Nom *",ph:"Snack El Baraka"},{key:"email",label:"Email *",ph:"contact@restaurant.com"},{key:"phone",label:"Téléphone",ph:"+33 6 XX XX XX XX"},{key:"address",label:"Adresse",ph:"123 rue de la Paix"}].map(f =>
                  <div key={f.key}>
                    <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>{f.label}</label>
                    <input value={newClient[f.key]} onChange={e=>setNewClient(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                )}
              </div>
              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Plan</label>
                <select value={newClient.plan} onChange={e=>setNewClient(p=>({...p,plan:e.target.value}))} style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
                  {PLANS.map(p => <option key={p.id} value={p.id}>{p.label} — {p.price}</option>)}
                </select>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={createClient} disabled={saving} style={{padding:"10px 24px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>{saving?"Création...":"Créer"}</button>
                <button onClick={()=>{setShowNewClient(false);setMsg("")}} style={{padding:"10px 24px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>Annuler</button>
              </div>
            </div>}

            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 100px",padding:"12px 20px",background:"#F5F5F2",fontSize:11,fontWeight:600,color:"#888",textTransform:"uppercase"}}>
                <div>Restaurant</div><div>Plan</div><div>Statut</div><div>Créé le</div><div>Action</div>
              </div>
              {loading ? <div style={{padding:20,color:"#888",fontSize:13}}>Chargement...</div> :
                tenants.length === 0 ? <div style={{padding:20,color:"#888",fontSize:13,textAlign:"center"}}>Aucun client</div> :
                tenants.map((t,i) => <div key={t.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 100px",padding:"14px 20px",borderTop:i>0?"0.5px solid #F0F0EC":"none",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{t.name}</div>
                    <div style={{fontSize:11,color:"#888"}}>{t.email}</div>
                  </div>
                  <div><Tag color={planColor(t.plan)}>{t.plan}</Tag></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:t.is_active?"#1D9E75":"#E24B4A"}}/>
                    <span style={{fontSize:12,color:t.is_active?"#0F6E56":"#A32D2D"}}>{t.is_active?"Actif":"Inactif"}</span>
                  </div>
                  <div style={{fontSize:12,color:"#888"}}>{new Date(t.created_at).toLocaleDateString("fr-FR")}</div>
                  <button onClick={()=>toggleActive(t.id,t.is_active)} style={{fontSize:11,padding:"4px 10px",background:t.is_active?"#FCEBEB":"#E1F5EE",color:t.is_active?"#A32D2D":"#0F6E56",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>{t.is_active?"Désactiver":"Activer"}</button>
                </div>)
              }
            </div>
          </div>
        )}

        {page === "stats" && (
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#222",marginBottom:20}}>Statistiques</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:16}}>
              {[
                {label:"Revenus mensuels",val:`${tenants.filter(t=>t.plan==="starter").length*29+tenants.filter(t=>t.plan==="pro").length*59+tenants.filter(t=>t.plan==="multi").length*149}€`,icon:"💰",color:"#0F6E56"},
                {label:"Taux de conversion",val:tenants.length?`${Math.round((tenants.filter(t=>t.plan!=="trial").length/tenants.length)*100)}%`:"0%",icon:"📈",color:"#185FA5"},
                {label:"Nouveaux cette semaine",val:tenants.filter(t=>new Date(t.created_at)>new Date(Date.now()-7*24*60*60*1000)).length,icon:"🆕",color:"#534AB7"},
              ].map((k,i) => <div key={i} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:20}}>
                <div style={{fontSize:28,marginBottom:8}}>{k.icon}</div>
                <div style={{fontSize:11,color:"#888",marginBottom:6}}>{k.label}</div>
                <div style={{fontSize:28,fontWeight:700,color:k.color}}>{k.val}</div>
              </div>)}
            </div>
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:20}}>
              <div style={{fontSize:14,fontWeight:600,color:"#222",marginBottom:16}}>Détail par plan</div>
              {PLANS.map(p => {
                const count = tenants.filter(t=>t.plan===p.id).length
                const rev = p.id==="starter"?count*29:p.id==="pro"?count*59:p.id==="multi"?count*149:0
                return <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"0.5px solid #F0F0EC"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:p.color}}/>
                    <span style={{fontSize:13,color:"#333"}}>{p.label}</span>
                  </div>
                  <div style={{display:"flex",gap:24}}>
                    <span style={{fontSize:13,color:"#888"}}>{count} client{count>1?"s":""}</span>
                    <span style={{fontSize:13,fontWeight:600,color:"#222"}}>{rev}€/mois</span>
                  </div>
                </div>
              })}
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:12,paddingTop:12,borderTop:"1px solid #E8E8E4"}}>
                <span style={{fontSize:14,fontWeight:700,color:"#1D9E75"}}>Total : {tenants.filter(t=>t.plan==="starter").length*29+tenants.filter(t=>t.plan==="pro").length*59+tenants.filter(t=>t.plan==="multi").length*149}€/mois</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ClientApp({ session, onLogout }) {
  const [page, setPage] = useState("dashboard")
  const NAV = [{id:"dashboard",icon:"🏠",label:"Accueil"},{id:"haccp",icon:"🎯",label:"HACCP"},{id:"checklist",icon:"✅",label:"Checklist"},{id:"reglementation",icon:"📋",label:"Réglements"},{id:"rapports",icon:"📊",label:"Rapports"}]
  return (
    <div style={{fontFamily:"'DM Sans','Trebuchet MS',sans-serif",maxWidth:460,margin:"0 auto",background:"#FAFAF8",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#fff",borderBottom:"0.5px solid #E8E8E4",padding:"14px 20px 12px",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,background:"#1D9E75",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🛡️</div>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:"#1a1a1a"}}>SnackSafe</div>
              <div style={{fontSize:10,color:"#888"}}>HACCP · Hygiène · Réglementation</div>
            </div>
          </div>
          <button onClick={onLogout} style={{fontSize:11,padding:"5px 12px",background:"#fff",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",color:"#666"}}>Déconnexion</button>
        </div>
      </div>
      <div style={{flex:1,padding:"16px 16px 80px",overflow:"auto"}}>
        {page==="dashboard" && <PageDashboard setPage={setPage}/>}
        {page==="haccp" && <PageHACCP/>}
        {page==="checklist" && <PageChecklist/>}
        {page==="reglementation" && <PageReglementation/>}
        {page==="rapports" && <PageRapports/>}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:460,background:"#fff",borderTop:"0.5px solid #E8E8E4",display:"flex",padding:"4px 8px 8px",zIndex:10}}>
        {NAV.map(n => <button key={n.id} onClick={()=>setPage(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:page===n.id?"#E1F5EE":"transparent"}}>
          <span style={{fontSize:20}}>{n.icon}</span>
          <span style={{fontSize:10,color:page===n.id?"#0F6E56":"#888",fontWeight:page===n.id?600:400}}>{n.label}</span>
        </button>)}
      </div>
    </div>
  )
}

function PageDashboard({ setPage }) {
  const alerts = TEMPERATURES.filter(t => tempStatus(t) !== "ok")
  const today = new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})
  return (
    <div>
      <div style={{fontSize:12,color:"#888",marginBottom:16,textTransform:"capitalize"}}>{today}</div>
      {alerts.length > 0 && <div style={{marginBottom:16}}>
        {alerts.map((a,i) => <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:ST[tempStatus(a)].bg,borderLeft:`3px solid ${ST[tempStatus(a)].color}`,borderRadius:8,marginBottom:6}}>
          <span style={{fontSize:14}}>{tempStatus(a)==="bad"?"🚨":"⚠️"}</span>
          <span style={{fontSize:12,color:ST[tempStatus(a)].color,fontWeight:500}}>{a.zone} : {a.val}°C — {ST[tempStatus(a)].label}</span>
        </div>)}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[
          {label:"Checklist du jour",val:"40%",sub:"2/5 tâches",color:"#0F6E56"},
          {label:"Alertes actives",val:alerts.length,sub:`${alerts.filter(a=>tempStatus(a)==="bad").length} critiques`,color:"#A32D2D"},
          {label:"CCP conformes",val:`${HACCP_POINTS.filter(h=>h.status==="ok").length}/${HACCP_POINTS.length}`,sub:"Points critiques",color:"#0F6E56"},
          {label:"Dernière inspection",val:"OK",sub:"Il y a 12 jours",color:"#185FA5"},
        ].map((k,i) => <div key={i} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,color:"#888",marginBottom:6}}>{k.label}</div>
          <div style={{fontSize:26,fontWeight:700,color:k.color}}>{k.val}</div>
          <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{k.sub}</div>
        </div>)}
      </div>
      <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:600,color:"#444",marginBottom:12}}>Températures en cours</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {TEMPERATURES.map((t,i) => { const st=tempStatus(t); return <div key={i} style={{textAlign:"center",background:ST[st].bg,borderRadius:8,padding:"8px 4px"}}>
            <div style={{fontSize:9,color:"#888",marginBottom:3}}>{t.zone}</div>
            <div style={{fontSize:18,fontWeight:700,color:ST[st].color}}>{t.val}°C</div>
            <div style={{fontSize:9,color:ST[st].color,marginTop:2}}>{ST[st].label}</div>
          </div>})}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[
          {label:"Checklist ouverture",icon:"✅",page:"checklist",bg:"#E1F5EE",color:"#085041"},
          {label:"Fiches HACCP",icon:"🎯",page:"haccp",bg:"#E6F1FB",color:"#042C53"},
          {label:"Allergènes",icon:"⚠️",page:"reglementation",bg:"#FAEEDA",color:"#412402"},
          {label:"Réglementation",icon:"📋",page:"reglementation",bg:"#EEEDFE",color:"#26215C"},
        ].map((q,i) => <button key={i} onClick={()=>setPage(q.page)} style={{background:q.bg,border:"none",borderRadius:10,padding:"14px 16px",textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>
          <div style={{fontSize:20,marginBottom:6}}>{q.icon}</div>
          <div style={{fontSize:12,fontWeight:600,color:q.color}}>{q.label}</div>
        </button>)}
      </div>
    </div>
  )
}

function PageHACCP() {
  const [open, setOpen] = useState(null)
  return <div>
    <div style={{fontSize:13,color:"#888",marginBottom:16}}>7 Points Critiques de Contrôle</div>
    {HACCP_POINTS.map(h => { const st=h.status; const isOpen=open===h.id; return (
      <div key={h.id} style={{background:"#fff",border:`0.5px solid ${isOpen?ST[st].color:"#E8E8E4"}`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
        <div onClick={()=>setOpen(isOpen?null:h.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer"}}>
          <div style={{width:40,height:40,borderRadius:10,background:ST[st].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:ST[st].color,flexShrink:0}}>{h.id}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:"#222",marginBottom:4}}>{h.label}</div>
            <div style={{display:"flex",gap:6}}><Tag color={st==="ok"?"green":st==="warn"?"amber":"red"}>{ST[st].label}</Tag><span style={{fontSize:11,color:"#aaa"}}>{h.category}</span></div>
          </div>
          <span style={{color:"#aaa",fontSize:16,transform:isOpen?"rotate(90deg)":"none",transition:"transform 0.2s"}}>›</span>
        </div>
        {isOpen && <div style={{padding:"0 16px 16px",borderTop:"0.5px solid #F0F0EC"}}>
          <div style={{background:ST[st].bg,borderRadius:8,padding:"10px 12px",margin:"12px 0"}}>
            <div style={{fontSize:10,fontWeight:700,color:ST[st].color,marginBottom:3,textTransform:"uppercase"}}>Limite critique</div>
            <div style={{fontSize:13,color:ST[st].color,fontWeight:600}}>{h.limit}</div>
          </div>
          {h.actions.map((a,i) => <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:"#1D9E75",marginTop:5,flexShrink:0}}/>
            <span style={{fontSize:12,color:"#444"}}>{a}</span>
          </div>)}
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:12,padding:"8px 12px",background:"#F5F5F2",borderRadius:8}}>
            <span style={{fontSize:12}}>🔄</span><span style={{fontSize:12,color:"#666"}}>Fréquence : <strong>{h.freq}</strong></span>
          </div>
        </div>}
      </div>
    )})}
  </div>
}

function PageChecklist() {
  const [tab, setTab] = useState("ouverture")
  const [checked, setChecked] = useState({})
  const toggle = (id) => setChecked(p=>({...p,[id]:!p[id]}))
  const items = CHECKLIST_ITEMS[tab]
  const done = items.filter(i=>checked[i.id]).length
  const pct = Math.round((done/items.length)*100)
  return <div>
    <div style={{display:"flex",gap:6,marginBottom:16,background:"#F0F0EC",borderRadius:10,padding:4}}>
      {["ouverture","service","fermeture"].map(t => {
        const d = CHECKLIST_ITEMS[t].filter(i=>checked[i.id]).length
        return <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"8px 6px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:tab===t?"#fff":"transparent",color:tab===t?"#0F6E56":"#888",fontWeight:tab===t?600:400,fontSize:11}}>
          {t.charAt(0).toUpperCase()+t.slice(1)}<br/><span style={{fontSize:10,color:"#aaa"}}>{d}/{CHECKLIST_ITEMS[t].length}</span>
        </button>
      })}
    </div>
    <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <span style={{fontSize:12,color:"#666"}}>{done} / {items.length} tâches</span>
        <span style={{fontSize:12,fontWeight:700,color:"#1D9E75"}}>{pct}%</span>
      </div>
      <div style={{height:6,background:"#F0F0EC",borderRadius:3}}>
        <div style={{height:"100%",background:"#1D9E75",borderRadius:3,width:`${pct}%`,transition:"width 0.3s"}}/>
      </div>
    </div>
    <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
      {items.map((item,idx) => <div key={item.id} onClick={()=>toggle(item.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:idx<items.length-1?"0.5px solid #F0F0EC":"none",cursor:"pointer",background:checked[item.id]?"#FAFAF8":"#fff"}}>
        <div style={{width:22,height:22,borderRadius:6,flexShrink:0,border:checked[item.id]?"none":"1.5px solid #DDD",background:checked[item.id]?"#1D9E75":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {checked[item.id] && <span style={{color:"#fff",fontSize:13}}>✓</span>}
        </div>
        <span style={{flex:1,fontSize:13,color:checked[item.id]?"#aaa":"#222",textDecoration:checked[item.id]?"line-through":"none"}}>{item.label}</span>
        {item.ccp && <Tag color={checked[item.id]?"green":"red"}>CCP</Tag>}
      </div>)}
    </div>
  </div>
}

function PageReglementation() {
  const [cat, setCat] = useState("Tous")
  const cats = ["Tous",...Array.from(new Set(REGLEMENTS.map(r=>r.categorie)))]
  const filtered = cat==="Tous"?REGLEMENTS:REGLEMENTS.filter(r=>r.categorie===cat)
  return <div>
    <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:4}}>14 Allergènes majeurs</div>
    <div style={{fontSize:11,color:"#888",marginBottom:12}}>Obligation d'affichage — Règl. UE 1169/2011</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:20}}>
      {ALLERGENS.map(a => <div key={a.id} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:10,padding:"10px 12px",display:"flex",gap:10,alignItems:"center"}}>
        <span style={{fontSize:20}}>{a.icon}</span>
        <div><div style={{fontSize:12,fontWeight:600,color:"#222"}}>{a.name}</div><div style={{fontSize:10,color:"#aaa"}}>{a.examples}</div></div>
      </div>)}
    </div>
    <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:12}}>Textes réglementaires</div>
    <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
      {cats.map(c => <button key={c} onClick={()=>setCat(c)} style={{padding:"5px 12px",borderRadius:20,border:"0.5px solid",fontFamily:"inherit",fontSize:11,cursor:"pointer",background:cat===c?"#1D9E75":"#fff",color:cat===c?"#fff":"#666",borderColor:cat===c?"#1D9E75":"#DDD"}}>{c}</button>)}
    </div>
    {filtered.map(r => <div key={r.id} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:13,fontWeight:700,color:"#222",flex:1,paddingRight:8}}>{r.titre}</div>
        <Tag color={r.priorite==="haute"?"red":"amber"}>{r.priorite==="haute"?"Prioritaire":"Important"}</Tag>
      </div>
      <div style={{fontSize:11,color:"#1D9E75",fontWeight:600,marginBottom:6}}>{r.ref} · {r.categorie}</div>
      <div style={{fontSize:12,color:"#555",lineHeight:1.6}}>{r.desc}</div>
    </div>)}
  </div>
}

function PageRapports() {
  const rapports = [
    {date:"08 avr. 2026",type:"Journalier",score:92,status:"ok"},
    {date:"07 avr. 2026",type:"Journalier",score:78,status:"warn"},
    {date:"06 avr. 2026",type:"Journalier",score:95,status:"ok"},
    {date:"31 mars 2026",type:"Hebdomadaire",score:88,status:"ok"},
    {date:"15 mars 2026",type:"Inspection DDPP",score:96,status:"ok"},
  ]
  return <div>
    <div style={{fontSize:13,color:"#888",marginBottom:16}}>Historique et génération de rapports</div>
    {rapports.map((r,i) => <div key={i} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:14}}>
      <div style={{width:48,height:48,borderRadius:10,background:ST[r.status].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:ST[r.status].color,flexShrink:0}}>{r.score}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{r.type}</div>
        <div style={{fontSize:11,color:"#aaa"}}>{r.date}</div>
      </div>
      <Tag color={r.status==="ok"?"green":"amber"}>{ST[r.status].label}</Tag>
    </div>)}
    <button style={{width:"100%",marginTop:8,padding:14,background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Générer le rapport du jour</button>
  </div>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F5F5F2",fontFamily:"sans-serif"}}>
      <div style={{background:"#fff",borderRadius:16,padding:"40px 36px",width:360,boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>
          <div style={{width:38,height:38,background:"#1D9E75",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🛡️</div>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:"#1a1a1a"}}>SnackSafe</div>
            <div style={{fontSize:11,color:"#888"}}>HACCP · Hygiène · Réglementation</div>
          </div>
        </div>
        {error && <div style={{background:"#FCEBEB",color:"#A32D2D",padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:13}}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,color:"#666",display:"block",marginBottom:5}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="votre@email.com" required style={{width:"100%",padding:"10px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12,color:"#666",display:"block",marginBottom:5}}>Mot de passe</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required style={{width:"100%",padding:"10px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <button type="submit" disabled={loading} style={{width:"100%",padding:12,background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>
            {loading?"Connexion...":"Se connecter"}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })
    supabase.auth.onAuthStateChange((_, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
  }, [])

  const loadProfile = async (userId) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single()
    setProfile(data)
    setLoading(false)
  }

  const handleLogout = () => supabase.auth.signOut()

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>🛡️</div>
        <div style={{fontSize:14,color:"#888"}}>Chargement SnackSafe...</div>
      </div>
    </div>
  )

  if (!session) return <Login />
  if (profile?.role === "super_admin") return <SuperAdmin session={session} onLogout={handleLogout} />
  return <ClientApp session={session} onLogout={handleLogout} />
}