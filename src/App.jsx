import jsPDF from 'jspdf'
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

const tempStatus = (val, eq) => {
  if (eq.type === "froid") {
    if (eq.temp_max && val > eq.temp_max) return "bad"
    if (eq.temp_max && val > eq.temp_max - 1 && val < eq.temp_max) return "warn"
    return "ok"
  }
  if (eq.type === "chaud") {
    if (eq.temp_min && val < eq.temp_min) return "bad"
       return "ok"
  }
  return "ok"
}

const Tag = ({ children, color = "green" }) => {
  const c = {
    green:{bg:"#E1F5EE",text:"#085041"},
    amber:{bg:"#FAEEDA",text:"#412402"},
    red:{bg:"#FCEBEB",text:"#501313"},
    blue:{bg:"#E6F1FB",text:"#042C53"},
    purple:{bg:"#EEEDFE",text:"#26215C"},
    gray:{bg:"#F1EFE8",text:"#2C2C2A"}
  }[color] || {bg:"#E1F5EE",text:"#085041"}
  return <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:c.bg,color:c.text}}>{children}</span>
}

const ICON_PATHS = {
  home:     "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  temp:     "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  check:    "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  report:   "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  box:      "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  fire:     "M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A8 8 0 0117.657 18.657z",
  snow:     "M12 2v20M12 2l3 3M12 2l-3 3M12 22l3-3M12 22l-3-3M2 12h20M2 12l3 3M2 12l3-3M22 12l-3 3M22 12l-3-3",
  warning:  "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  alert:    "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  shield:   "M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z",
  clip:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
}

const Icon = ({ name, size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{display:"block",flexShrink:0}}>
    <path d={ICON_PATHS[name]} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      fill={name === "shield" ? color : "none"}/>
  </svg>
)

const NavBtn = ({ icon, label, active, onClick, accent }) => (
  <button onClick={onClick} style={{
    flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3,
    padding:"6px 2px", border:"none", cursor:"pointer", fontFamily:"inherit",
    background: active ? "rgba(45,212,191,0.08)" : "transparent",
    borderRadius:8, margin:"0 1px",
  }}>
    <div style={{
      width:28, height:28, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center",
      background: active ? "#2DD4BF" : accent ? "#FEF3C7" : "transparent",
    }}>
      <Icon name={icon} size={14} color={active ? "#1A2E44" : accent ? "#F59E0B" : "#94A3B8"} />
    </div>
    <span style={{fontSize:9, fontWeight: active ? 600 : 400, color: active ? "#2DD4BF" : accent ? "#F59E0B" : "#94A3B8"}}>
      {label}
    </span>
  </button>
)
function PageEquipements({ profile }) {
  const [equipements, setEquipements] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newEq, setNewEq] = useState({ nom:"", type:"froid", temp_min:"", temp_max:"" })
  const [saisieValues, setSaisieValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [activeTab, setActiveTab] = useState("equipements")
  const tenantId = profile?.tenant_id

  useEffect(() => {
    if (tenantId) { loadEquipements(); loadLogs() }
  }, [tenantId])

  const loadEquipements = async () => {
    setLoading(true)
    const { data } = await supabase.from("equipements").select("*").eq("tenant_id", tenantId).eq("actif", true).order("created_at")
    setEquipements(data || [])
    setLoading(false)
  }

  const loadLogs = async () => {
    const today = new Date().toISOString().split("T")[0]
    const { data } = await supabase.from("temperature_logs").select("*").eq("tenant_id", tenantId).gte("recorded_at", today).order("recorded_at", { ascending: false })
    setLogs(data || [])
  }

  const ajouterEquipement = async () => {
    if (!newEq.nom) { setMsg("Le nom est obligatoire"); return }
    setSaving(true)
    const { error } = await supabase.from("equipements").insert([{
      tenant_id: tenantId, nom: newEq.nom, type: newEq.type,
      temp_min: newEq.temp_min ? parseFloat(newEq.temp_min) : null,
      temp_max: newEq.temp_max ? parseFloat(newEq.temp_max) : null, actif: true,
    }])
    if (error) setMsg("Erreur : " + error.message)
    else { setMsg("✅ Équipement ajouté !"); setNewEq({ nom:"", type:"froid", temp_min:"", temp_max:"" }); setShowForm(false); loadEquipements() }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const supprimerEquipement = async (id) => {
    await supabase.from("equipements").update({ actif: false }).eq("id", id)
    loadEquipements()
  }

  const saisirTemperatures = async () => {
    setSaving(true)
    const records = equipements
      .filter(eq => saisieValues[eq.id] !== undefined && saisieValues[eq.id] !== "")
      .map(eq => {
        const val = parseFloat(saisieValues[eq.id])
        const st = tempStatus(val, eq)
        return { tenant_id: tenantId, zone: eq.nom, value: val, type: eq.type, is_compliant: st === "bad", recorded_at: new Date().toISOString() }
      })
    if (records.length === 0) { setMsg("Saisissez au moins une température"); setSaving(false); return }
    const { error } = await supabase.from("temperature_logs").insert(records)
    if (error) setMsg("Erreur : " + error.message)
    else { setMsg("✅ Températures enregistrées !"); setSaisieValues({}); setActiveTab("historique"); loadLogs() }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const todayStr = new Date().toISOString().split("T")[0]
  const todayLogs = logs.filter(l => new Date(l.recorded_at).toISOString().split("T")[0] === todayStr)
  const alerts = todayLogs.filter(l => !l.is_compliant)

  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:16,background:"#F0F0EC",borderRadius:10,padding:4}}>
        {[{id:"equipements",label:"🔧 Équipements"},{id:"saisie",label:"🌡️ Saisie T°"},{id:"historique",label:"📋 Historique"}].map(t =>
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,padding:"8px 4px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:activeTab===t.id?"#fff":"transparent",color:activeTab===t.id?"#0F6E56":"#888",fontWeight:activeTab===t.id?600:400,fontSize:11}}>
            {t.label}
          </button>
        )}
      </div>

      {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}

      {activeTab === "equipements" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:13,color:"#888"}}>{equipements.length} équipement{equipements.length>1?"s":""}</div>
            <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 16px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>+ Ajouter</button>
          </div>

          {showForm && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,color:"#222",marginBottom:12}}>Nouvel équipement</div>
            <div style={{marginBottom:10}}>
              <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Nom *</label>
              <input value={newEq.nom} onChange={e=>setNewEq(p=>({...p,nom:e.target.value}))} placeholder="Ex: Frigo cuisine, Congélateur..." style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:10}}>
              <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Type</label>
              <select value={newEq.type} onChange={e=>setNewEq(p=>({...p,type:e.target.value}))} style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
                <option value="froid">❄️ Froid (frigo, congélateur, vitrine)</option>
                <option value="chaud">🔥 Chaud (bain-marie, four, plancha)</option>
                <option value="ambiant">🌡️ Ambiant (salle, réserve)</option>
              </select>
            </div>
            {newEq.type === "froid" && <div style={{marginBottom:12}}>
              <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Température max (°C)</label>
              <input type="number" value={newEq.temp_max} onChange={e=>setNewEq(p=>({...p,temp_max:e.target.value}))} placeholder="Ex: 4" style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>}
            {newEq.type === "chaud" && <div style={{marginBottom:12}}>
              <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Température min (°C)</label>
              <input type="number" value={newEq.temp_min} onChange={e=>setNewEq(p=>({...p,temp_min:e.target.value}))} placeholder="Ex: 63" style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={ajouterEquipement} disabled={saving} style={{padding:"8px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>{saving?"...":"Ajouter"}</button>
              <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Annuler</button>
            </div>
          </div>}

          {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
            equipements.length === 0 ? <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🔧</div>
              <div style={{fontSize:13,color:"#888",marginBottom:4}}>Aucun équipement configuré</div>
              <div style={{fontSize:11,color:"#aaa"}}>Ajoutez vos frigos, congélateurs, bains-marie...</div>
            </div> :
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"visible"}}>
              {equipements.map((eq,i) => {
                const lastLog = todayLogs.find(l => l.zone === eq.nom)
                const st = lastLog ? (lastLog.is_compliant ? "ok" : "bad") : null
                return <div key={eq.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:i<equipements.length-1?"0.5px solid #F0F0EC":"none"}}>
                  <div style={{width:40,height:40,borderRadius:10,background:eq.type==="froid"?"#E6F1FB":eq.type==="chaud"?"#FCEBEB":"#F1EFE8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                    {eq.type==="froid"?"❄️":eq.type==="chaud"?"🔥":"🌡️"}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{eq.nom}</div>
                    <div style={{fontSize:11,color:"#888"}}>
                      {eq.type==="froid" && eq.temp_max && `Max : ${eq.temp_max}°C`}
                      {eq.type==="chaud" && eq.temp_min && `Min : ${eq.temp_min}°C`}
                      {eq.type==="ambiant" && "Température ambiante"}
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {lastLog ? <div style={{textAlign:"center"}}>
                      <div style={{fontSize:16,fontWeight:700,color:ST[st].color}}>{lastLog.value}°C</div>
                      <Tag color={st==="ok"?"green":"red"}>{ST[st].label}</Tag>
                    </div> : <span style={{fontSize:11,color:"#aaa"}}>Non relevé</span>}
                    <button onClick={()=>supprimerEquipement(eq.id)} style={{fontSize:11,padding:"4px 8px",background:"#FCEBEB",color:"#A32D2D",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
                  </div>
                </div>
              })}
            </div>
          }
        </div>
      )}

      {activeTab === "saisie" && (
        <div>
          <div style={{fontSize:13,color:"#888",marginBottom:16,textTransform:"capitalize"}}>
            {new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          {equipements.length === 0 ? (
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🔧</div>
              <div style={{fontSize:13,color:"#888"}}>Ajoutez d'abord vos équipements</div>
            </div>
          ) : (
            <div>
              <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden",marginBottom:14}}>
                {equipements.map((eq,i) => {
                  const lastLog = todayLogs.find(l => l.zone === eq.nom)
                  const currentVal = saisieValues[eq.id]
                  const previewSt = currentVal ? tempStatus(parseFloat(currentVal), eq) : null
                  return <div key={eq.id} style={{padding:"14px 16px",borderBottom:i<equipements.length-1?"0.5px solid #F0F0EC":"none"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:18}}>{eq.type==="froid"?"❄️":eq.type==="chaud"?"🔥":"🌡️"}</span>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{eq.nom}</div>
                          <div style={{fontSize:11,color:"#888"}}>
                            {eq.type==="froid" && eq.temp_max && `Max : ${eq.temp_max}°C`}
                            {eq.type==="chaud" && eq.temp_min && `Min : ${eq.temp_min}°C`}
                          </div>
                        </div>
                      </div>
                      {lastLog && <Tag color={lastLog.is_compliant?"green":"red"}>{lastLog.value}°C relevé</Tag>}
                    </div>
                    <input
                      type="number" step="0.1"
                      value={saisieValues[eq.id] || ""}
                      onChange={e=>setSaisieValues(p=>({...p,[eq.id]:e.target.value}))}
                      placeholder="Saisir la température en °C"
                      style={{width:"100%",padding:"10px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box"}}
                    />
                    {previewSt && <div style={{marginTop:6,fontSize:12,color:ST[previewSt].color,fontWeight:500}}>
                      {previewSt==="ok"?"✅ Conforme":previewSt==="warn"?"⚠️ Attention — proche de la limite":"🚨 Non conforme — action requise"}
                    </div>}
                  </div>
                })}
              </div>
              <button onClick={saisirTemperatures} disabled={saving} style={{width:"100%",padding:14,background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {saving ? "Enregistrement..." : "💾 Enregistrer les températures"}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "historique" && (
        <div>
          <div style={{fontSize:13,color:"#888",marginBottom:16}}>Relevés enregistrés</div>
          {alerts.length > 0 && <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"#A32D2D",marginBottom:8}}>🚨 Alertes aujourd'hui</div>
            {alerts.map((a,i) => <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#FCEBEB",borderLeft:"3px solid #E24B4A",borderRadius:8,marginBottom:6}}>
              <span style={{fontSize:12,color:"#A32D2D",fontWeight:500}}>{a.zone} : {a.value}°C — Non conforme</span>
            </div>)}
          </div>}
          {logs.length === 0 ? (
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>📋</div>
              <div style={{fontSize:13,color:"#888"}}>Aucun relevé enregistré</div>
            </div>
          ) : (
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
              {logs.slice(0,30).map((log,i) => {
                const d = new Date(log.recorded_at)
                const st = log.is_compliant ? "ok" : "bad"
                return <div key={log.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<logs.length-1?"0.5px solid #F0F0EC":"none"}}>
                  <div style={{width:44,height:44,borderRadius:10,background:ST[st].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:ST[st].color,flexShrink:0}}>
                    {log.value}°
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{log.zone}</div>
                    <div style={{fontSize:11,color:"#888"}}>{d.toLocaleDateString("fr-FR")} à {d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                  <Tag color={log.is_compliant?"green":"red"}>{log.is_compliant?"Conforme":"⚠️ Alerte"}</Tag>
                </div>
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
function PageParametres({ profile }) {
  const [pin, setPin] = useState(profile?.rapport_pin || "")
  const [msg, setMsg] = useState("")
  const [saving, setSaving] = useState(false)

  const savePin = async () => {
    if (pin && pin.length !== 4) { setMsg("Le PIN doit contenir 4 chiffres"); return }
    setSaving(true)
    const { error } = await supabase.from("profiles")
      .update({ rapport_pin: pin || null })
      .eq("id", profile.id)
    if (error) setMsg("Erreur : " + error.message)
    else setMsg("✅ PIN mis à jour !")
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  return <div>
    <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:20,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:4}}>🔒 Code PIN Rapports</div>
      <div style={{fontSize:11,color:"#888",marginBottom:16}}>Protège l'accès à la page Rapports avec un code à 4 chiffres</div>
      <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Code PIN (4 chiffres)</label>
      <input type="password" maxLength={4} value={pin} onChange={e=>setPin(e.target.value)}
        placeholder="••••"
        style={{width:"100%",padding:"10px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:18,outline:"none",boxSizing:"border-box",letterSpacing:8,textAlign:"center",marginBottom:8}}/>
      <div style={{fontSize:11,color:"#aaa",marginBottom:12}}>Laissez vide pour désactiver le PIN</div>
      {msg && <div style={{padding:"8px 12px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:12}}>{msg}</div>}
      <button onClick={savePin} disabled={saving}
        style={{width:"100%",padding:12,background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>
        {saving ? "Enregistrement..." : "💾 Sauvegarder le PIN"}
      </button>
    </div>

    <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:20}}>
      <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:4}}>👤 Mon compte</div>
      <div style={{fontSize:12,color:"#555",marginBottom:4}}>Email : {profile?.id}</div>
      <div style={{fontSize:12,color:"#555"}}>Rôle : {profile?.role === "client" ? "Manager" : profile?.role}</div>
    </div>
  </div>
}

function PageRapports({ profile }) {
  const [rapports, setRapports] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState("")
  const tenantId = profile?.tenant_id
  
  useEffect(() => { if (tenantId) loadRapports() }, [tenantId])

  const loadRapports = async () => {
    setLoading(true)
    const { data } = await supabase.from("daily_reports").select("*").eq("tenant_id", tenantId).order("report_date", { ascending: false }).limit(10)
    setRapports(data || [])
    setLoading(false)
  }

  const genererRapport = async () => {
    setGenerating(true)
    const today = new Date().toISOString().split("T")[0]
    const { data: logs } = await supabase.from("temperature_logs").select("*").eq("tenant_id", tenantId).gte("recorded_at", today)
    const total = logs?.length || 0
    const conformes = logs?.filter(l => l.is_compliant).length || 0
    const alerts = total - conformes
    const score = total > 0 ? Math.round((conformes / total) * 100) : 0
    const { error } = await supabase.from("daily_reports").upsert([{
      tenant_id: tenantId, report_date: today, score,
      checklist_pct: 0, temp_alerts: alerts,
      summary: `Rapport du ${new Date().toLocaleDateString("fr-FR")} — ${total} relevés, ${conformes} conformes, ${alerts} alertes.`,
    }], { onConflict: "tenant_id,report_date" })
    if (error) setMsg("Erreur : " + error.message)
    else { setMsg("✅ Rapport généré !"); loadRapports() }
    setGenerating(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const exportPDF = async (rapport) => {
  const date = rapport.report_date
  const dateFR = new Date(date).toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long", year:"numeric"})

  const [{ data: tempLogs }, { data: checklogs }, { data: receptions }, { data: actions }] = await Promise.all([
    supabase.from("temperature_logs").select("*").eq("tenant_id", tenantId).gte("recorded_at", date).lt("recorded_at", new Date(new Date(date).getTime() + 86400000).toISOString().split("T")[0]),
    supabase.from("checklist_logs").select("*").eq("tenant_id", tenantId).eq("date", date),
    supabase.from("receptions").select("*").eq("tenant_id", tenantId).eq("date", date),
    supabase.from("actions_correctives").select("*").eq("tenant_id", tenantId).eq("date", date),
  ])

  const doc = new jsPDF()
  let y = 45

  doc.setFillColor(29, 158, 117)
  doc.rect(0, 0, 210, 35, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.text("SnackSafe", 14, 16)
  doc.setFontSize(11)
  doc.text("Rapport HACCP journalier", 14, 24)
  doc.text(dateFR, 14, 31)

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(13)
  doc.setFillColor(240, 248, 244)
  doc.rect(14, y-6, 182, 12, "F")
  doc.text(`Score global : ${rapport.score}/100`, 16, y)
  y += 14

  const section = (titre) => {
    doc.setFontSize(12)
    doc.setTextColor(29, 158, 117)
    doc.text(titre, 14, y)
    y += 7
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
  }

  section("Relevés de température")
  if (tempLogs?.length > 0) {
    tempLogs.forEach(l => {
      const h = new Date(l.recorded_at).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"})
      doc.text(`• ${l.zone} : ${l.value}°C — ${l.is_compliant ? "Conforme" : "Non conforme"} (${h})`, 16, y)
      y += 6; if (y > 275) { doc.addPage(); y = 20 }
    })
  } else { doc.text("Aucun relevé", 16, y); y += 6 }
  y += 4

  section("Checklist")
  const checkedCount = checklogs?.filter(c => c.is_checked).length || 0
  doc.text(`Tâches complétées : ${checkedCount}/${checklogs?.length || 0}`, 16, y); y += 6
  y += 4

  section("Réceptions marchandises")
  if (receptions?.length > 0) {
    receptions.forEach(r => {
      doc.text(`• ${r.produit} (${r.fournisseur}) — ${r.statut === "accepte" ? "Accepté" : r.statut === "refuse" ? "Refusé" : "Réserve"}`, 16, y)
      y += 6; if (y > 275) { doc.addPage(); y = 20 }
    })
  } else { doc.text("Aucune réception", 16, y); y += 6 }
  y += 4

  section("Actions correctives")
  if (actions?.length > 0) {
    actions.forEach(a => {
      doc.text(`• ${a.description} — ${a.statut}`, 16, y)
      y += 6; if (y > 275) { doc.addPage(); y = 20 }
    })
  } else { doc.text("Aucune action corrective", 16, y); y += 6 }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text("Généré par SnackSafe", 14, 290)
    doc.text(`Page ${i}/${pageCount}`, 185, 290)
  }

  doc.save(`rapport-haccp-${date}.pdf`)
}
  const scoreColor = (s) => s >= 80 ? "ok" : s >= 60 ? "warn" : "bad"

  return (
    <div>
      <div style={{fontSize:13,color:"#888",marginBottom:16}}>Rapports journaliers</div>
      {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}
      <button onClick={genererRapport} disabled={generating} style={{width:"100%",marginBottom:16,padding:14,background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
        {generating ? "Génération..." : "📊 Générer le rapport du jour"}
      </button>
      {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
        rapports.length === 0 ? (
          <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:8}}>📊</div>
            <div style={{fontSize:13,color:"#888"}}>Aucun rapport généré</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:4}}>Saisissez des températures puis générez le rapport</div>
          </div>
        ) : (
          <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
            {rapports.map((r,i) => {
              const st = scoreColor(r.score || 0)
              return <div key={r.id} style={{padding:"14px 16px",borderBottom:i<rapports.length-1?"0.5px solid #F0F0EC":"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:52,height:52,borderRadius:10,background:ST[st].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:ST[st].color,flexShrink:0}}>{r.score || 0}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{new Date(r.report_date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div>
                    <div style={{fontSize:11,color:"#888",marginTop:2}}>{r.summary}</div>
                    <div style={{display:"flex",gap:8,marginTop:6}}>
                      {r.temp_alerts > 0 && <Tag color="red">{r.temp_alerts} alerte{r.temp_alerts>1?"s":""}</Tag>}
                      <Tag color={st==="ok"?"green":st==="warn"?"amber":"red"}>Score : {r.score || 0}/100</Tag>
                    </div>
                    <button onClick={()=>exportPDF(r)} style={{marginTop:8,padding:"4px 12px",background:"#E6F1FB",color:"#042C53",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600}}>
  📄 Exporter PDF
</button>
                  </div>
                </div>
              </div>
            })}
          </div>
        )
      }
    </div>
  )
}

function SuperAdmin({ session, onLogout }) {
  const [page, setPage] = useState("dashboard")
  const [pinOk, setPinOk] = useState(false)
const [pinInput, setPinInput] = useState("")
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ name:"", email:"", password:"", phone:"", address:"", plan:"trial" })
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
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({ email: newClient.email, password: newClient.password, email_confirm: true })
if (authError) { setMsg("Erreur auth : " + authError.message); setSaving(false); return }
const trialEnd = new Date(); trialEnd.setMonth(trialEnd.getMonth() + 1)
const { data: tenantData, error } = await supabase.from("tenants").insert([{ name:newClient.name, email:newClient.email, phone:newClient.phone, address:newClient.address, plan:newClient.plan, slug, is_active:true, trial_ends_at: trialEnd.toISOString() }]).select().single()
if (!error) { await supabase.rpc('create_profile_on_signup', { user_id: authData.user.id, tenant_id: tenantData.id, user_role: 'client' }) }
    if (error) setMsg("Erreur : " + error.message)
    else { setMsg("✅ Client créé !"); setNewClient({name:"",email:"",phone:"",address:"",plan:"trial"}); setShowNewClient(false); loadTenants() }
    setSaving(false)
  }

  const toggleActive = async (id, current) => {
    await supabase.from("tenants").update({ is_active: !current }).eq("id", id)
    loadTenants()
  }
const supprimerClient = async (id) => {
  if (!window.confirm("Supprimer ce client définitivement ?")) return
  await supabase.from("tenants").delete().eq("id", id)
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
                  <div><div style={{fontSize:11,color:"#888",marginBottom:8}}>{k.label}</div><div style={{fontSize:32,fontWeight:700,color:k.color}}>{k.val}</div></div>
                  <div style={{width:40,height:40,background:k.bg,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{k.icon}</div>
                </div>
              </div>)}
            </div>
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:600,color:"#222"}}>Derniers clients</div>
                <button onClick={()=>setPage("clients")} style={{fontSize:12,color:"#1D9E75",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Voir tous →</button>
              </div>
              {tenants.length === 0 ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Aucun client</div> :
                tenants.slice(0,5).map(t => <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"0.5px solid #F0F0EC"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:34,height:34,background:"#E1F5EE",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🏪</div>
                    <div><div style={{fontSize:13,fontWeight:600,color:"#222"}}>{t.name}</div><div style={{fontSize:11,color:"#888"}}>{t.email}</div></div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Tag color={planColor(t.plan)}>{t.plan}</Tag>
                    <div style={{width:8,height:8,borderRadius:"50%",background:t.is_active?"#1D9E75":"#E24B4A"}}/>
                  </div>
                </div>)
              }
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
                {[{key:"name",label:"Nom *",ph:"Snack El Baraka"},{key:"email",label:"Email *",ph:"contact@restaurant.com"},{key:"password",label:"Mot de passe *",ph:"6 caractères minimum"},{key:"phone",label:"Téléphone",ph:"+33 6 XX XX XX XX"},{key:"address",label:"Adresse",ph:"123 rue de la Paix"}].map(f =>
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
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",padding:"12px 20px",background:"#F5F5F2",fontSize:11,fontWeight:600,color:"#888",textTransform:"uppercase"}}>
                <div>Restaurant</div><div>Plan</div><div>Statut</div><div>Créé le</div><div>Action</div>
              </div>
              {tenants.map((t,i) => <div key={t.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",padding:"14px 20px",borderTop:i>0?"0.5px solid #F0F0EC":"none",alignItems:"center"}}>
                <div><div style={{fontSize:13,fontWeight:600,color:"#222"}}>{t.name}</div><div style={{fontSize:11,color:"#888"}}>{t.email}</div></div>
                <div><Tag color={planColor(t.plan)}>{t.plan}</Tag></div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:t.is_active?"#1D9E75":"#E24B4A"}}/>
                  <span style={{fontSize:12,color:t.is_active?"#0F6E56":"#A32D2D"}}>{t.is_active?"Actif":"Inactif"}</span>
                </div>
                <div style={{fontSize:12,color:"#888"}}>{new Date(t.created_at).toLocaleDateString("fr-FR")}</div>
               <div style={{display:"flex",gap:6}}>
                <button onClick={()=>toggleActive(t.id,t.is_active)} style={{fontSize:11,padding:"4px 10px",background:t.is_active?"#FCEBEB":"#E1F5EE",color:t.is_active?"#A32D2D":"#0F6E56",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>{t.is_active?"Désactiver":"Activer"}</button>
                <button onClick={()=>supprimerClient(t.id)} style={{fontSize:11,padding:"4px 10px",background:"#FCEBEB",color:"#A32D2D",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>Supprimer</button>
              </div>
              </div>)}
            </div>
          </div>
        )}
        {page === "stats" && (
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#222",marginBottom:20}}>Statistiques</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
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
          </div>
        )}
      </div>
    </div>
  )
}

function ClientApp({ session, profile, onLogout }) {
  const [page, setPage] = useState("dashboard")
  const [pinOk, setPinOk] = useState(false)
  const [pinInput, setPinInput] = useState("")
  const [onboardingDone, setOnboardingDone] = useState(false)
  useEffect(() => {
  if (profile !== null) {
    setOnboardingDone(!!profile?.onboarding_done)
  }
}, [profile])

  const NAV_ROW1 = [
    { id:"dashboard",   icon:"home",     label:"Accueil"    },
  ]
  
  return (
    <div style={{fontFamily:"'DM Sans','Trebuchet MS',sans-serif",maxWidth:460,margin:"0 auto",background:"#F7F8FA",minHeight:"100vh",display:"flex",flexDirection:"column"}}>

      {/* HEADER */}
      <div style={{background:"#1A2E44",padding:"18px 20px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,background:"#2DD4BF",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Icon name="shield" size={20} color="#1A2E44" />
            </div>
            <div>
              <div style={{fontSize:16,fontWeight:600,color:"#fff"}}>SnackSafe</div>
              <div style={{fontSize:10,color:"#64748B"}}>HACCP · Hygiène · Réglementation</div>
            </div>
          </div>
          <button onClick={onLogout} style={{fontSize:11,padding:"6px 13px",background:"rgba(255,255,255,0.08)",border:"0.5px solid rgba(255,255,255,0.15)",borderRadius:8,cursor:"pointer",fontFamily:"inherit",color:"#94A3B8"}}>
            Déconnexion
          </button>
        </div>
        <div style={{paddingTop:10,borderTop:"0.5px solid rgba(255,255,255,0.06)"}}>
          <span style={{fontSize:12,color:"#64748B",textTransform:"capitalize"}}>
            {new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}
          </span>
        </div>
      </div>

      {/* CONTENT */}
      {!onboardingDone ? <PageOnboarding setPage={setPage} setOnboardingDone={setOnboardingDone} profile={profile}/> :
        <div style={{flex:1,padding:"16px 14px 110px",overflow:"auto"}}>
        {page==="dashboard"       && <PageDashboard setPage={setPage} profile={profile}/>}
        {page==="parametres"      && <PageParametres profile={profile}/>}
        {page==="equipements"     && <PageEquipements profile={profile}/>}
        {page==="checklist"       && <PageChecklist profile={profile}/>}
        {page==="reglementation"  && <PageReglementation/>}
        {page==="rapports" && (
          pinOk || !profile?.rapport_pin ?
            <PageRapports profile={profile}/> :
            <div style={{background:"#fff",borderRadius:16,padding:32,textAlign:"center",margin:"20px 0"}}>
              <div style={{fontSize:32,marginBottom:12}}>🔒</div>
              <div style={{fontSize:15,fontWeight:600,color:"#222",marginBottom:4}}>Accès protégé</div>
              <div style={{fontSize:12,color:"#888",marginBottom:20}}>Entrez le code PIN pour accéder aux rapports</div>
              <input type="password" maxLength={4} value={pinInput} onChange={e=>setPinInput(e.target.value)}
                placeholder="••••" style={{width:120,padding:"10px 12px",border:"2px solid #E0E0DC",borderRadius:8,fontSize:20,outline:"none",textAlign:"center",letterSpacing:8,marginBottom:12}}/>
              <br/>
              <button onClick={()=>{if(pinInput===profile?.rapport_pin){setPinOk(true)}else{setPinInput("");alert("Code PIN incorrect")}}}
                style={{padding:"10px 24px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>
                Valider
              </button>
            </div>
        )}
        {page==="reception"       && <PageReception profile={profile}/>}
        {page==="maintien"        && <PageMaintienChaud profile={profile}/>}
        {page==="refroidissement" && <PageRefroidissement profile={profile}/>}
        {page==="actions"         && <PageActionsCorrectives profile={profile}/>}
      </div>}
          
          {page !== "dashboard" && (
            <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:460,background:"#1A2E44",paddingBottom:"env(safe-area-inset-bottom)"}}>
              <button onClick={()=>setPage("dashboard")} style={{width:"100%",padding:"14px",border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"}}>
                <Icon name="home" size={18} color="#2DD4BF"/>
                <span style={{fontSize:13,fontWeight:600,color:"#2DD4BF"}}>Accueil</span>
              </button>
            </div>
          )}
        </div>
      )
    }
function PageOnboarding({ setPage, setOnboardingDone, profile }) {
  const steps = [
    { id:"equipements", label:"Ajouter vos équipements", sub:"Frigos, congélateurs, bains-marie...", bg:"#E1F5EE", iconColor:"#0F6E56", icon:"temp", page:"equipements" },
    { id:"checklist",   label:"Faire votre 1ère checklist", sub:"Ouverture, service, fermeture", bg:"#DBEAFE", iconColor:"#185FA5", icon:"check", page:"checklist" },
    { id:"temperatures",label:"Saisir vos températures", sub:"Premier relevé du jour", bg:"#FAEEDA", iconColor:"#BA7517", icon:"temp", page:"equipements" },
  ]
  const [done, setDone] = useState([])

  const handleStep = (page) => {
    setDone(p => [...new Set([...p, page])])
    setPage(page)
  }

  return (
    <div style={{minHeight:"100vh",background:"#F7F8FA",fontFamily:"'DM Sans','Trebuchet MS',sans-serif"}}>
      <div style={{background:"#1A2E44",padding:"40px 24px 32px",textAlign:"center"}}>
        <div style={{width:64,height:64,background:"#2DD4BF",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
          <Icon name="shield" size={36} color="#1A2E44"/>
        </div>
        <div style={{fontSize:22,fontWeight:700,color:"#fff",marginBottom:8}}>Bienvenue sur SnackSafe ! 🎉</div>
        <div style={{fontSize:13,color:"#94A3B8",lineHeight:1.6}}>Votre assistant HACCP est prêt.<br/>Suivez ces 3 étapes pour démarrer.</div>
      </div>

      <div style={{padding:"20px 24px 0"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:12,color:"#94A3B8"}}>Progression</span>
          <span style={{fontSize:12,fontWeight:600,color:"#2DD4BF"}}>{done.length} / 3 étapes</span>
        </div>
        <div style={{height:6,background:"#E2E8F0",borderRadius:3}}>
          <div style={{height:"100%",background:"#2DD4BF",borderRadius:3,width:`${(done.length/3)*100}%`,transition:"width 0.3s"}}/>
        </div>
      </div>

      <div style={{padding:"16px 24px",display:"flex",flexDirection:"column",gap:12}}>
        {steps.map((s,i) => {
          const isDone = done.includes(s.page)
          const isActive = i === 0 || done.includes(steps[i-1].page)
          return (
            <button key={s.id} onClick={()=>isActive && handleStep(s.page)}
              style={{background:"#fff",borderRadius:16,padding:16,border:isActive&&!isDone?"2px solid #2DD4BF":"0.5px solid #E2E8F0",display:"flex",alignItems:"center",gap:14,opacity:isActive?1:0.5,cursor:isActive?"pointer":"default",fontFamily:"inherit",textAlign:"left",width:"100%"}}>
              <div style={{width:48,height:48,background:s.bg,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <Icon name={s.icon} size={24} color={s.iconColor}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:"#1A2E44",marginBottom:3}}>{s.label}</div>
                <div style={{fontSize:12,color:"#94A3B8"}}>{s.sub}</div>
              </div>
              <div style={{width:28,height:28,background:isDone?"#2DD4BF":"#E2E8F0",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {isDone
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>
                  : <span style={{fontSize:13,color:"#94A3B8",fontWeight:700}}>{i+1}</span>
                }
              </div>
            </button>
          )
        })}
      </div>

      <div style={{padding:"8px 24px 24px"}}>
        <button onClick={async ()=>{
  await supabase.from('profiles').update({onboarding_done: true}).eq('id', profile.id)
  setOnboardingDone(true)
}} style={{width:"100%",padding:16,background:"#2DD4BF",border:"none",borderRadius:14,fontSize:14,fontWeight:700,color:"#1A2E44",cursor:"pointer",fontFamily:"inherit"}}>
          Accéder à mon tableau de bord
        </button>
        <button onClick={async ()=>{
  await supabase.from('profiles').update({onboarding_done: true}).eq('id', profile.id)
  setOnboardingDone(true)
}} style={{width:"100%",padding:12,background:"transparent",border:"none",fontSize:12,color:"#94A3B8",cursor:"pointer",fontFamily:"inherit",marginTop:8}}>
          Passer l'introduction
        </button>
      </div>
    </div>
  )
}
function PageDashboard({ setPage, profile }) {
  const [todayAlerts, setTodayAlerts] = useState([])
  const tenantId = profile?.tenant_id

  useEffect(() => {
    if (tenantId) {
      const today = new Date().toISOString().split("T")[0]
      supabase.from("temperature_logs").select("*").eq("tenant_id", tenantId).eq("is_compliant", false).gte("recorded_at", today)
        .then(({ data }) => setTodayAlerts(data || []))
    }
  }, [tenantId])

  const MODULES = [
    { id:"equipements",    label:"Températures",  bg:"#FF6B6B", icon:"temp" },
    { id:"checklist",      label:"Checklist",      bg:"#4ECDC4", icon:"check" },
    { id:"reception",      label:"Réception",      bg:"#A78BFA", icon:"box" },
    { id:"maintien",       label:"Chaud",          bg:"#FF9F43", icon:"fire" },
    { id:"refroidissement",label:"Froid",          bg:"#54A0FF", icon:"snow" },
    { id:"actions",        label:"Actions",        bg:"#F9CA24", icon:"warning", textColor:"#7D5A00" },
    { id:"rapports",       label:"Rapports",       bg:"#6AB04C", icon:"report" },
    { id:"reglementation", label:"Règlement.",     bg:"#EE5A24", icon:"clip" },
    { id:"parametres",     label:"Paramètres",     bg:"#B8E994", icon:"settings", textColor:"#2C6B2F" },
  ]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir"

  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"calc(100vh - 120px)"}}>

      {/* Greeting */}
      <div style={{marginBottom:16,padding:"4px 0"}}>
        <div style={{fontSize:20,fontWeight:700,color:"#1A2E44"}}>{greeting} 👋</div>
        <div style={{fontSize:13,color:"#888",marginTop:2}}>
          {todayAlerts.length > 0 ? `⚠️ ${todayAlerts.length} alerte(s) aujourd'hui` : "✅ Tout est sous contrôle"}
        </div>
      </div>

      {/* Alertes */}
      {todayAlerts.length > 0 && (
        <div style={{marginBottom:14}}>
          {todayAlerts.map((a,i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:"#FEF2F2",borderLeft:"4px solid #EF4444",borderRadius:12,marginBottom:6}}>
              <Icon name="alert" size={15} color="#EF4444"/>
              <div>
                <div style={{fontSize:13,fontWeight:500,color:"#991B1B"}}>{a.zone} : {a.value}°C</div>
                <div style={{fontSize:11,color:"#B91C1C"}}>Non conforme · Action requise</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPI row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:20}}>
        {[
          { label:"Alertes", val:todayAlerts.length, color:todayAlerts.length>0?"#EF4444":"#10B981", icon:"🚨" },
          { label:"CCP ok",  val:`${HACCP_POINTS.filter(h=>h.status==="ok").length}/${HACCP_POINTS.length}`, color:"#1A2E44", icon:"✅" },
          { label:"Formation", val:"100%", color:"#10B981", icon:"🎓" },
        ].map((k,i) => (
          <div key={i} style={{background:"#fff",borderRadius:16,padding:"14px 8px",border:"0.5px solid #E2E8F0",textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:18}}>{k.icon}</div>
            <div style={{fontSize:20,fontWeight:700,color:k.color,lineHeight:1,marginTop:4}}>{k.val}</div>
            <div style={{fontSize:10,color:"#94A3B8",marginTop:3}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Modules title */}
      <p style={{margin:"0 0 10px",fontSize:13,fontWeight:600,color:"#1A2E44"}}>Modules</p>

      {/* Modules grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {MODULES.map((m,i) => (
          <button key={i} onClick={()=>setPage(m.id)} style={{background:m.bg,borderRadius:20,padding:"18px 10px",border:"none",textAlign:"center",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 12px rgba(0,0,0,0.12)",transform:"scale(1)",transition:"transform 0.1s"}}>
            <div style={{width:48,height:48,background:"rgba(255,255,255,0.25)",borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}>
              <Icon name={m.icon} size={24} color={m.textColor || "#fff"}/>
            </div>
            <div style={{fontSize:11,fontWeight:700,color:m.textColor || "#fff",letterSpacing:0.3}}>{m.label}</div>
          </button>
        ))}
      </div>

      {/* Dernière activité */}
      <div style={{marginTop:20,background:"#fff",borderRadius:16,padding:"16px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:13,fontWeight:600,color:"#1A2E44",marginBottom:10}}>📋 Dernière activité</div>
        <div style={{fontSize:12,color:"#888",textAlign:"center",padding:"10px 0"}}>
          Aucune activité récente
        </div>
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

function PageChecklist({ profile }) {
  const [tab, setTab] = useState("ouverture")
  const [checked, setChecked] = useState({})
  const [loading, setLoading] = useState(true)
  const tenantId = profile?.tenant_id
  const today = new Date().toISOString().split("T")[0]

  useEffect(() => {
    if (tenantId) loadChecklist()
  }, [tenantId])

  const loadChecklist = async () => {
    setLoading(true)
    const { data } = await supabase
      .from("checklist_logs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("date", today)
    if (data) {
      const map = {}
      data.forEach(row => { map[row.item_id] = row.is_checked })
      setChecked(map)
    }
    setLoading(false)
  }

  const toggle = async (id) => {
    const newVal = !checked[id]
    setChecked(p => ({ ...p, [id]: newVal }))
    await supabase.from("checklist_logs").upsert([{
      tenant_id: tenantId,
      date: today,
      item_id: id,
    is_checked: newVal,
    }], { onConflict: "tenant_id,date,item_id" })
  }

  const items = CHECKLIST_ITEMS[tab]
  const done = items.filter(i => checked[i.id]).length
  const pct = Math.round((done / items.length) * 100)

  if (loading) return <div style={{color:"#888",fontSize:13,textAlign:"center",padding:40}}>Chargement...</div>

  return <div>
    <div style={{display:"flex",gap:6,marginBottom:16,background:"#F0F0EC",borderRadius:10,padding:4}}>
      {["ouverture","service","fermeture"].map(t => {
        const d = CHECKLIST_ITEMS[t].filter(i => checked[i.id]).length
        return <button key={t} onClick={() => setTab(t)} style={{flex:1,padding:"8px 6px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:tab===t?"#fff":"transparent",color:tab===t?"#0F6E56":"#888",fontWeight:tab===t?600:400,fontSize:11}}>
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
function PageReception({ profile }) {
  const [receptions, setReceptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [uploading, setUploading] = useState(false)
  const [activeTab, setActiveTab] = useState("receptions") // "receptions" | "referentiel"

  // Référentiel
  const [fournisseurs, setFournisseurs] = useState([])
  const [articles, setArticles] = useState([]) // articles du fournisseur sélectionné
  const [newFournisseur, setNewFournisseur] = useState("")
  const [newArticle, setNewArticle] = useState("")
  const [selectedFournisseurRef, setSelectedFournisseurRef] = useState(null)
  const [savingRef, setSavingRef] = useState(false)
  const [msgRef, setMsgRef] = useState("")

  const tenantId = profile?.tenant_id
  const [form, setForm] = useState({
    fournisseur_id: "", fournisseur: "", produit: "", temperature: "",
    dlc: "", aspect_visuel: "conforme", origine: "",
    numero_lot: "", etiquetage_conforme: true,
    stockage_separe: true, statut: "accepte",
    commentaire: "", photo_url: ""
  })

  useEffect(() => { if (tenantId) { loadReceptions(); loadFournisseurs() } }, [tenantId])

  const loadReceptions = async () => {
    setLoading(true)
    const { data } = await supabase.from("receptions").select("*")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20)
    setReceptions(data || [])
    setLoading(false)
  }

  const loadFournisseurs = async () => {
    const { data } = await supabase.from("fournisseurs").select("*")
      .eq("tenant_id", tenantId).order("nom")
    setFournisseurs(data || [])
  }

  const loadArticles = async (fournisseurId) => {
    const { data } = await supabase.from("articles").select("*")
      .eq("fournisseur_id", fournisseurId).order("nom")
    setArticles(data || [])
  }

  const handleSelectFournisseur = (e) => {
    const id = e.target.value
    const f = fournisseurs.find(f => f.id === id)
    setForm(p => ({ ...p, fournisseur_id: id, fournisseur: f?.nom || "", produit: "" }))
    if (id) loadArticles(id)
    else setArticles([])
  }

  // --- Référentiel : ajout fournisseur ---
  const addFournisseur = async () => {
    if (!newFournisseur.trim()) return
    setSavingRef(true)
    const { data, error } = await supabase.from("fournisseurs")
      .insert([{ user_id: profile?.id: tenantId, nom: newFournisseur.trim() }]).select().single()
    if (error) { setMsgRef("Erreur : " + error.message) }
    else {
      setFournisseurs(p => [...p, data])
      setNewFournisseur("")
      setSelectedFournisseurRef(data)
      setArticles([])
      setMsgRef("✅ Fournisseur ajouté !")
    }
    setSavingRef(false)
    setTimeout(() => setMsgRef(""), 2500)
  }

  const deleteFournisseur = async (id) => {
    if (!confirm("Supprimer ce fournisseur et tous ses articles ?")) return
    await supabase.from("fournisseurs").delete().eq("id", id)
    setFournisseurs(p => p.filter(f => f.id !== id))
    if (selectedFournisseurRef?.id === id) { setSelectedFournisseurRef(null); setArticles([]) }
  }

  // --- Référentiel : ajout article ---
  const addArticle = async () => {
    if (!newArticle.trim() || !selectedFournisseurRef) return
    setSavingRef(true)
    const { data, error } = await supabase.from("articles")
      .insert([{ fournisseur_id: selectedFournisseurRef.id, nom: newArticle.trim() }]).select().single()
    if (error) { setMsgRef("Erreur : " + error.message) }
    else {
      setArticles(p => [...p, data])
      setNewArticle("")
      setMsgRef("✅ Article ajouté !")
    }
    setSavingRef(false)
    setTimeout(() => setMsgRef(""), 2500)
  }

  const deleteArticle = async (id) => {
    await supabase.from("articles").delete().eq("id", id)
    setArticles(p => p.filter(a => a.id !== id))
  }

  const handlePhoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const fileName = `${tenantId}/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from("receptions").upload(fileName, file)
    if (error) { setMsg("Erreur upload : " + error.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from("receptions").getPublicUrl(fileName)
    setForm(p => ({ ...p, photo_url: urlData.publicUrl }))
    setUploading(false)
  }

  const handleSubmit = async () => {
    if (!form.fournisseur || !form.produit) { setMsg("Fournisseur et produit obligatoires"); return }
    setSaving(true)
    const temp = form.temperature ? parseFloat(form.temperature) : null
    const temp_conforme = temp !== null ? temp <= 4 : null
    const dlc_conforme = form.dlc ? new Date(form.dlc) >= new Date() : null
    const { error } = await supabase.from("receptions").insert([{
      tenant_id: tenantId,
      fournisseur: form.fournisseur,
      produit: form.produit,
      temperature: temp,
      temperature_conforme: temp_conforme,
      dlc: form.dlc || null,
      dlc_conforme,
      aspect_visuel: form.aspect_visuel,
      etiquetage_conforme: form.etiquetage_conforme,
      stockage_separe: form.stockage_separe,
      statut: form.statut,
      commentaire: form.commentaire,
      origine: form.origine || null,
      numero_lot: form.numero_lot || null,
      photo_url: form.photo_url || null,
    }])
    if (error) setMsg("Erreur : " + error.message)
    else {
      setMsg("✅ Fiche enregistrée !")
      setForm({ fournisseur_id:"", fournisseur:"", produit:"", temperature:"", dlc:"", aspect_visuel:"conforme", origine:"", numero_lot:"", etiquetage_conforme:true, stockage_separe:true, statut:"accepte", commentaire:"", photo_url:"" })
      setArticles([])
      setShowForm(false)
      loadReceptions()
    }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  // ---- ONGLETS ----
  const tabStyle = (t) => ({
    padding:"8px 16px", fontSize:12, fontWeight:600, cursor:"pointer",
    border:"none", borderRadius:8, fontFamily:"inherit",
    background: activeTab===t ? "#1D9E75" : "#F0F0EC",
    color: activeTab===t ? "#fff" : "#666"
  })

  return <div>
    {/* Onglets */}
    <div style={{display:"flex",gap:8,marginBottom:16}}>
      <button style={tabStyle("receptions")} onClick={()=>setActiveTab("receptions")}>📦 Réceptions</button>
      <button style={tabStyle("referentiel")} onClick={()=>setActiveTab("referentiel")}>📋 Référentiel</button>
    </div>

    {/* ===== ONGLET RÉFÉRENTIEL ===== */}
    {activeTab === "referentiel" && <div>
      {msgRef && <div style={{padding:"10px 14px",background:msgRef.includes("✅")?"#E1F5EE":"#FCEBEB",color:msgRef.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msgRef}</div>}

      {/* Ajout fournisseur */}
      <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:16,marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:12}}>🏢 Fournisseurs</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={newFournisseur} onChange={e=>setNewFournisseur(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addFournisseur()}
            placeholder="Nom du fournisseur..."
            style={{flex:1,padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none"}}/>
          <button onClick={addFournisseur} disabled={savingRef}
            style={{padding:"8px 14px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>
            + Ajouter
          </button>
        </div>

        {/* Liste fournisseurs */}
        {fournisseurs.length === 0
          ? <div style={{fontSize:12,color:"#aaa",textAlign:"center",padding:"8px 0"}}>Aucun fournisseur — ajoutez-en un !</div>
          : fournisseurs.map(f => (
            <div key={f.id} onClick={()=>{ setSelectedFournisseurRef(f); loadArticles(f.id) }}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"10px 12px",borderRadius:8,cursor:"pointer",marginBottom:4,
                background:selectedFournisseurRef?.id===f.id?"#E1F5EE":"#F8F8F6",
                border:selectedFournisseurRef?.id===f.id?"1px solid #1D9E75":"1px solid transparent"}}>
              <span style={{fontSize:13,fontWeight:selectedFournisseurRef?.id===f.id?700:400,color:"#222"}}>
                {selectedFournisseurRef?.id===f.id?"▶ ":""}{f.nom}
              </span>
              <button onClick={e=>{e.stopPropagation();deleteFournisseur(f.id)}}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#ccc",padding:"0 4px"}}>🗑️</button>
            </div>
          ))
        }
      </div>

      {/* Articles du fournisseur sélectionné */}
      {selectedFournisseurRef && <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:16}}>
        <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:12}}>
          🛒 Articles — <span style={{color:"#1D9E75"}}>{selectedFournisseurRef.nom}</span>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={newArticle} onChange={e=>setNewArticle(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addArticle()}
            placeholder="Nom de l'article..."
            style={{flex:1,padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none"}}/>
          <button onClick={addArticle} disabled={savingRef}
            style={{padding:"8px 14px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>
            + Ajouter
          </button>
        </div>

        {articles.length === 0
          ? <div style={{fontSize:12,color:"#aaa",textAlign:"center",padding:"8px 0"}}>Aucun article pour ce fournisseur</div>
          : articles.map(a => (
            <div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"9px 12px",borderRadius:8,background:"#F8F8F6",marginBottom:4}}>
              <span style={{fontSize:13,color:"#222"}}>📌 {a.nom}</span>
              <button onClick={()=>deleteArticle(a.id)}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#ccc",padding:"0 4px"}}>🗑️</button>
            </div>
          ))
        }
      </div>}
    </div>}

    {/* ===== ONGLET RÉCEPTIONS ===== */}
    {activeTab === "receptions" && <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:13,color:"#888"}}>{receptions.length} fiche(s)</div>
        <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 16px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>+ Nouvelle fiche</button>
      </div>

      {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}

      {showForm && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:14}}>📦 Nouvelle réception</div>

        {/* SELECT Fournisseur */}
        <div style={{marginBottom:10}}>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Fournisseur *</label>
          <select value={form.fournisseur_id} onChange={handleSelectFournisseur}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
            <option value="">— Choisir un fournisseur —</option>
            {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          {fournisseurs.length === 0 && <div style={{fontSize:11,color:"#F59E0B",marginTop:4}}>
            ⚠️ Aucun fournisseur — ajoutez-en dans l'onglet Référentiel
          </div>}
        </div>

        {/* SELECT Article */}
        <div style={{marginBottom:10}}>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Produit *</label>
          <select value={form.produit} onChange={e=>setForm(p=>({...p,produit:e.target.value}))}
            disabled={!form.fournisseur_id}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:form.fournisseur_id?"#fff":"#F8F8F6"}}>
            <option value="">— Choisir un produit —</option>
            {articles.map(a => <option key={a.id} value={a.nom}>{a.nom}</option>)}
          </select>
          {form.fournisseur_id && articles.length === 0 && <div style={{fontSize:11,color:"#F59E0B",marginTop:4}}>
            ⚠️ Aucun article pour ce fournisseur — ajoutez-en dans Référentiel
          </div>}
        </div>

        {[["Température (°C)","temperature","number"],["DLC / DDM","dlc","date"]].map(([label,key,type]) =>
          <div key={key} style={{marginBottom:10}}>
            <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>{label}</label>
            <input type={type} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}
              style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>🌍 Origine</label>
            <input value={form.origine} onChange={e=>setForm(p=>({...p,origine:e.target.value}))}
              placeholder="Ex: France..."
              style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>🏷️ N° de lot</label>
            <input value={form.numero_lot} onChange={e=>setForm(p=>({...p,numero_lot:e.target.value}))}
              placeholder="Ex: LOT2024..."
              style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
        </div>

        <div style={{marginBottom:10}}>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Aspect visuel</label>
          <select value={form.aspect_visuel} onChange={e=>setForm(p=>({...p,aspect_visuel:e.target.value}))}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
            <option value="conforme">✅ Conforme</option>
            <option value="non_conforme">❌ Non conforme</option>
            <option value="acceptable">⚠️ Acceptable</option>
          </select>
        </div>

        {[["etiquetage_conforme","🏷️ Étiquetage conforme"],["stockage_separe","📦 Stockage cru/cuit séparé"]].map(([key,label]) =>
          <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"0.5px solid #F0F0EC"}}>
            <span style={{fontSize:13,color:"#222"}}>{label}</span>
            <button onClick={()=>setForm(p=>({...p,[key]:!p[key]}))}
              style={{padding:"4px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,background:form[key]?"#1D9E75":"#E0E0DC",color:form[key]?"#fff":"#666"}}>
              {form[key]?"Oui":"Non"}
            </button>
          </div>
        )}

        <div style={{marginTop:12,marginBottom:10}}>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Statut final</label>
          <select value={form.statut} onChange={e=>setForm(p=>({...p,statut:e.target.value}))}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
            <option value="accepte">✅ Accepté</option>
            <option value="refuse">❌ Refusé</option>
            <option value="reserve">⚠️ Accepté avec réserve</option>
          </select>
        </div>

        <div style={{marginBottom:10}}>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Commentaire</label>
          <textarea value={form.commentaire} onChange={e=>setForm(p=>({...p,commentaire:e.target.value}))} rows={2}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>📷 Photo bon de livraison</label>
          <input type="file" accept="image/*" capture="environment" onChange={handlePhoto}
            style={{width:"100%",fontSize:12,color:"#666"}}/>
          {uploading && <div style={{fontSize:11,color:"#888",marginTop:4}}>⏳ Upload en cours...</div>}
          {form.photo_url && <img src={form.photo_url} alt="bon de livraison"
            style={{width:"100%",borderRadius:8,marginTop:8,maxHeight:200,objectFit:"cover"}}/>}
        </div>

        <div style={{display:"flex",gap:8}}>
          <button onClick={handleSubmit} disabled={saving||uploading}
            style={{padding:"8px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>
            {saving?"...":"Enregistrer"}
          </button>
          <button onClick={()=>setShowForm(false)}
            style={{padding:"8px 16px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>
            Annuler
          </button>
        </div>
      </div>}

      {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
        receptions.length === 0
          ? <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>📦</div>
              <div style={{fontSize:13,color:"#888"}}>Aucune réception enregistrée</div>
            </div>
          : <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
              {receptions.map((r,i) => (
                <div key={r.id} style={{padding:"13px 16px",borderBottom:i<receptions.length-1?"0.5px solid #F0F0EC":"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600,color:"#222"}}>{r.produit}</span>
                    <Tag color={r.statut==="accepte"?"green":r.statut==="refuse"?"red":"amber"}>
                      {r.statut==="accepte"?"✅ Accepté":r.statut==="refuse"?"❌ Refusé":"⚠️ Réserve"}
                    </Tag>
                  </div>
                  <div style={{fontSize:11,color:"#888"}}>{r.fournisseur} · {new Date(r.date).toLocaleDateString("fr-FR")}</div>
                  {r.origine && <div style={{fontSize:11,color:"#555",marginTop:2}}>🌍 {r.origine} {r.numero_lot && `· Lot: ${r.numero_lot}`}</div>}
                  {r.temperature && <div style={{fontSize:11,color:r.temperature_conforme?"#0F6E56":"#A32D2D",marginTop:2}}>🌡️ {r.temperature}°C {r.temperature_conforme?"✓":"⚠️"}</div>}
                  {r.photo_url && <img src={r.photo_url} alt="bon" style={{width:"100%",borderRadius:8,marginTop:8,maxHeight:150,objectFit:"cover"}}/>}
                </div>
              ))}
            </div>
      }
    </div>}
  </div>
}
  function PageRefroidissement({ profile }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const tenantId = profile?.tenant_id
  const [form, setForm] = useState({
    plat: "", heure_debut: "", heure_fin: "",
    temp_debut: "", temp_fin: "", action_corrective: ""
  })

  useEffect(() => { if (tenantId) loadLogs() }, [tenantId])

  const loadLogs = async () => {
    setLoading(true)
    const { data } = await supabase.from("refroidissement").select("*")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20)
    setLogs(data || [])
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!form.plat || !form.heure_debut || !form.temp_debut) {
      setMsg("Plat, heure de début et température initiale obligatoires"); return
    }
    setSaving(true)
    const temp_debut = parseFloat(form.temp_debut)
    const temp_fin = form.temp_fin ? parseFloat(form.temp_fin) : null
    let conforme = null
    if (temp_fin !== null && form.heure_debut && form.heure_fin) {
      const [h1, m1] = form.heure_debut.split(":").map(Number)
      const [h2, m2] = form.heure_fin.split(":").map(Number)
      const dureeMin = (h2 * 60 + m2) - (h1 * 60 + m1)
      conforme = temp_fin <= 10 && dureeMin <= 120
    }
    const { error } = await supabase.from("refroidissement").insert([{
      tenant_id: tenantId, plat: form.plat,
      heure_debut: form.heure_debut, heure_fin: form.heure_fin || null,
      temp_debut, temp_fin, conforme,
      action_corrective: conforme === false ? form.action_corrective : null,
    }])
    if (error) setMsg("Erreur : " + error.message)
    else {
      setMsg("✅ Relevé enregistré !")
      setForm({ plat:"", heure_debut:"", heure_fin:"", temp_debut:"", temp_fin:"", action_corrective:"" })
      setShowForm(false)
      loadLogs()
    }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const temp_fin_val = parseFloat(form.temp_fin)
  const previewOk = form.temp_fin ? temp_fin_val <= 10 : null

  return <div>
    <div style={{background:"#E6F1FB",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:12,color:"#042C53"}}>
      ❄️ <strong>Règle HACCP</strong> — Refroidissement : <strong>de +63°C à +10°C en moins de 2h</strong>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{fontSize:13,color:"#888"}}>{logs.length} relevé(s)</div>
      <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 16px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>+ Nouveau relevé</button>
    </div>
    {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}
    {showForm && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:14}}>❄️ Nouveau relevé refroidissement</div>
      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Plat *</label>
        <input value={form.plat} onChange={e=>setForm(p=>({...p,plat:e.target.value}))}
          placeholder="Ex: Poulet rôti..."
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Heure début *</label>
          <input type="time" value={form.heure_debut} onChange={e=>setForm(p=>({...p,heure_debut:e.target.value}))}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Heure fin</label>
          <input type="time" value={form.heure_fin} onChange={e=>setForm(p=>({...p,heure_fin:e.target.value}))}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>T° début (°C) *</label>
          <input type="number" step="0.1" value={form.temp_debut} onChange={e=>setForm(p=>({...p,temp_debut:e.target.value}))}
            placeholder="Ex: 65"
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>T° fin (°C)</label>
          <input type="number" step="0.1" value={form.temp_fin} onChange={e=>setForm(p=>({...p,temp_fin:e.target.value}))}
            placeholder="Ex: 8"
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          {previewOk !== null && <div style={{marginTop:4,fontSize:11,fontWeight:500,color:previewOk?"#0F6E56":"#A32D2D"}}>
            {previewOk ? "✅ T° finale conforme" : "🚨 Non conforme (> 10°C)"}
          </div>}
        </div>
      </div>
      {previewOk === false && <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Action corrective *</label>
        <input value={form.action_corrective} onChange={e=>setForm(p=>({...p,action_corrective:e.target.value}))}
          placeholder="Ex: Prolongation refroidissement..."
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>}
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={handleSubmit} disabled={saving} style={{padding:"8px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>{saving?"...":"Enregistrer"}</button>
        <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Annuler</button>
      </div>
    </div>}
    {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
      logs.length === 0 ? <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>❄️</div>
        <div style={{fontSize:13,color:"#888"}}>Aucun relevé enregistré</div>
      </div> :
      <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
        {logs.map((l,i) => <div key={l.id} style={{padding:"13px 16px",borderBottom:i<logs.length-1?"0.5px solid #F0F0EC":"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:13,fontWeight:600,color:"#222"}}>{l.plat}</span>
            <Tag color={l.conforme===true?"green":l.conforme===false?"red":"amber"}>
              {l.conforme===true?"✅ Conforme":l.conforme===false?"❌ Non conforme":"⏳ En cours"}
            </Tag>
          </div>
          <div style={{fontSize:11,color:"#888"}}>{new Date(l.date).toLocaleDateString("fr-FR")} · {l.heure_debut?.slice(0,5)}{l.heure_fin?" → "+l.heure_fin?.slice(0,5):""}</div>
          <div style={{fontSize:11,color:"#555",marginTop:2}}>{l.temp_debut}°C → {l.temp_fin !== null ? l.temp_fin+"°C" : "en cours..."}</div>
          {l.action_corrective && <div style={{fontSize:11,color:"#A32D2D",marginTop:4}}>⚠️ {l.action_corrective}</div>}
        </div>)}
      </div>
    }
  </div>
}
  function PageMaintienChaud({ profile }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const tenantId = profile?.tenant_id
  const [form, setForm] = useState({
    plat: "", heure_debut: "", temperature: "", action_corrective: ""
  })

  useEffect(() => { if (tenantId) loadLogs() }, [tenantId])

  const loadLogs = async () => {
    setLoading(true)
    const { data } = await supabase.from("maintien_chaud").select("*")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20)
    setLogs(data || [])
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!form.plat || !form.heure_debut || !form.temperature) {
      setMsg("Plat, heure et température obligatoires"); return
    }
    setSaving(true)
    const temp = parseFloat(form.temperature)
    const temp_conforme = temp >= 63
    const statut = temp_conforme ? "conforme" : "non_conforme"
    const { error } = await supabase.from("maintien_chaud").insert([{
      tenant_id: tenantId,
      plat: form.plat,
      heure_debut: form.heure_debut,
      temperature: temp,
      temperature_conforme: temp_conforme,
      action_corrective: temp_conforme ? null : form.action_corrective,
      statut,
    }])
    if (error) setMsg("Erreur : " + error.message)
    else {
      setMsg("✅ Relevé enregistré !")
      setForm({ plat: "", heure_debut: "", temperature: "", action_corrective: "" })
      setShowForm(false)
      loadLogs()
    }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const temp = parseFloat(form.temperature)
  const previewStatut = form.temperature ? (temp >= 63 ? "ok" : "bad") : null

  return <div>
    <div style={{background:"#E6F1FB",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:12,color:"#042C53"}}>
      🌡️ <strong>Règle HACCP</strong> — Maintien en température chaude : <strong>≥ 63°C en permanence</strong>
    </div>

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{fontSize:13,color:"#888"}}>{logs.length} relevé(s)</div>
      <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 16px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>+ Nouveau relevé</button>
    </div>

    {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}

    {showForm && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:14}}>🔥 Nouveau relevé maintien chaud</div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Plat / Préparation *</label>
        <input value={form.plat} onChange={e=>setForm(p=>({...p,plat:e.target.value}))}
          placeholder="Ex: Poulet rôti, sauce tomate..."
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Heure du relevé *</label>
        <input type="time" value={form.heure_debut} onChange={e=>setForm(p=>({...p,heure_debut:e.target.value}))}
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Température relevée (°C) *</label>
        <input type="number" step="0.1" value={form.temperature} onChange={e=>setForm(p=>({...p,temperature:e.target.value}))}
          placeholder="Ex: 68"
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        {previewStatut && <div style={{marginTop:6,fontSize:12,fontWeight:500,color:previewStatut==="ok"?"#0F6E56":"#A32D2D"}}>
          {previewStatut==="ok" ? "✅ Conforme (≥ 63°C)" : "🚨 Non conforme — action requise !"}
        </div>}
      </div>

      {previewStatut === "bad" && <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Action corrective *</label>
        <input value={form.action_corrective} onChange={e=>setForm(p=>({...p,action_corrective:e.target.value}))}
          placeholder="Ex: Remise en chauffe, élimination du plat..."
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>}

      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={handleSubmit} disabled={saving} style={{padding:"8px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>{saving?"...":"Enregistrer"}</button>
        <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Annuler</button>
      </div>
    </div>}

    {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
      logs.length === 0 ? <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>🔥</div>
        <div style={{fontSize:13,color:"#888"}}>Aucun relevé enregistré</div>
      </div> :
      <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
        {logs.map((l,i) => <div key={l.id} style={{padding:"13px 16px",borderBottom:i<logs.length-1?"0.5px solid #F0F0EC":"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:13,fontWeight:600,color:"#222"}}>{l.plat}</span>
            <Tag color={l.statut==="conforme"?"green":"red"}>
              {l.temperature}°C {l.temperature_conforme?"✓":"⚠️"}
            </Tag>
          </div>
          <div style={{fontSize:11,color:"#888"}}>{new Date(l.date).toLocaleDateString("fr-FR")} à {l.heure_debut?.slice(0,5)}</div>
          {l.action_corrective && <div style={{fontSize:11,color:"#A32D2D",marginTop:4}}>⚠️ {l.action_corrective}</div>}
        </div>)}
      </div>
    }
  </div>
}
function PageActionsCorrectives({ profile }) {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const tenantId = profile?.tenant_id
  const [form, setForm] = useState({
    source: "temperature", description: "", action_prise: "",
    responsable: "", statut: "en_cours", date_resolution: ""
  })

  useEffect(() => { if (tenantId) loadActions() }, [tenantId])

  const loadActions = async () => {
    setLoading(true)
    const { data } = await supabase.from("actions_correctives").select("*")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20)
    setActions(data || [])
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!form.description || !form.action_prise) {
      setMsg("Description et action prise obligatoires"); return
    }
    setSaving(true)
    const { error } = await supabase.from("actions_correctives").insert([{
      tenant_id: tenantId,
      source: form.source,
      description: form.description,
      action_prise: form.action_prise,
      responsable: form.responsable || null,
      statut: form.statut,
      date_resolution: form.date_resolution || null,
    }])
    if (error) setMsg("Erreur : " + error.message)
    else {
      setMsg("✅ Action enregistrée !")
      setForm({ source:"temperature", description:"", action_prise:"", responsable:"", statut:"en_cours", date_resolution:"" })
      setShowForm(false)
      loadActions()
    }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const updateStatut = async (id, statut) => {
    await supabase.from("actions_correctives").update({ statut, date_resolution: statut === "resolue" ? new Date().toISOString().split("T")[0] : null }).eq("id", id)
    loadActions()
  }

  const statutColor = (s) => s === "resolue" ? "green" : s === "en_cours" ? "amber" : "red"
  const statutLabel = (s) => s === "resolue" ? "✅ Résolue" : s === "en_cours" ? "⏳ En cours" : "🚨 Critique"

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{fontSize:13,color:"#888"}}>{actions.filter(a=>a.statut!=="resolue").length} action(s) en cours</div>
      <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 16px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>+ Nouvelle action</button>
    </div>

    {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}

    {showForm && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:14}}>⚠️ Nouvelle action corrective</div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Source du problème</label>
        <select value={form.source} onChange={e=>setForm(p=>({...p,source:e.target.value}))}
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
          <option value="temperature">🌡️ Température non conforme</option>
          <option value="reception">📦 Réception marchandises</option>
          <option value="hygiene">🧹 Hygiène</option>
          <option value="equipement">🔧 Équipement défaillant</option>
          <option value="haccp">⚠️ Non-conformité HACCP</option>
          <option value="autre">📝 Autre</option>
        </select>
      </div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Description du problème *</label>
        <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}
          placeholder="Ex: Frigo cuisine à 8°C depuis ce matin..."
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
      </div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Action prise *</label>
        <textarea value={form.action_prise} onChange={e=>setForm(p=>({...p,action_prise:e.target.value}))} rows={2}
          placeholder="Ex: Transfert des produits, appel technicien..."
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
      </div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Responsable</label>
        <input value={form.responsable} onChange={e=>setForm(p=>({...p,responsable:e.target.value}))}
          placeholder="Ex: Chef de cuisine, Gérant..."
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>

      <div style={{marginBottom:14}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Statut</label>
        <select value={form.statut} onChange={e=>setForm(p=>({...p,statut:e.target.value}))}
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
          <option value="en_cours">⏳ En cours</option>
          <option value="resolue">✅ Résolue</option>
          <option value="critique">🚨 Critique</option>
        </select>
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={handleSubmit} disabled={saving} style={{padding:"8px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>{saving?"...":"Enregistrer"}</button>
        <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Annuler</button>
      </div>
    </div>}

    {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
      actions.length === 0 ? <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>⚠️</div>
        <div style={{fontSize:13,color:"#888"}}>Aucune action corrective</div>
      </div> :
      <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
        {actions.map((a,i) => <div key={a.id} style={{padding:"13px 16px",borderBottom:i<actions.length-1?"0.5px solid #F0F0EC":"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <Tag color={statutColor(a.statut)}>{statutLabel(a.statut)}</Tag>
            <span style={{fontSize:10,color:"#aaa"}}>{new Date(a.date).toLocaleDateString("fr-FR")}</span>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:"#222",marginBottom:4}}>{a.description}</div>
          <div style={{fontSize:11,color:"#555",marginBottom:6}}>→ {a.action_prise}</div>
          {a.responsable && <div style={{fontSize:11,color:"#888"}}>👤 {a.responsable}</div>}
          {a.statut !== "resolue" && <button onClick={()=>updateStatut(a.id,"resolue")}
            style={{marginTop:8,padding:"4px 12px",background:"#E1F5EE",color:"#085041",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600}}>
            Marquer résolue ✅
          </button>}
        </div>)}
      </div>
    }
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

function Login({ onShowRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }
  const handleReset = async () => {
  if (!email) return alert("Entre ton email d'abord")
  try {
    const res = await fetch('https://packbag.fr/snacksafe/reset-password.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
    const data = await res.json()
    if (data.success) setResetSent(true)
    else alert("Erreur : " + data.error)
  } catch(e) {
    alert("Erreur de connexion")
  }
}

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#F5F5F2",fontFamily:"sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:360,boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>
          <div style={{width:38,height:38,background:"#1A2E44",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="shield" size={22} color="#2DD4BF"/>
          </div>
          <div>
            <div style={{fontSize:18,fontWeight:600,color:"#1A2E44"}}>SnackSafe</div>
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
          <button type="submit" disabled={loading} style={{width:"100%",padding:12,background:"#1A2E44",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
          <div style={{textAlign:"center",marginTop:12}}>
            {resetSent ? (
              <div style={{color:"#0F6E56",fontSize:13}}>✅ Email envoyé ! Vérifie ta boîte mail.</div>
            ) : (
              <button type="button" onClick={handleReset} style={{background:"none",border:"none",color:"#888",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
                Mot de passe oublié ?
              </button>
            )}
          </div>
        </form>
     
        <div style={{marginTop:20,textAlign:"center",paddingTop:20,borderTop:"0.5px solid #E8E8E4"}}>
          <p style={{fontSize:13,color:"#888",marginBottom:10}}>Pas encore de compte ?</p>
          <button onClick={onShowRegister} style={{width:"100%",padding:12,background:"#E1F5EE",color:"#0F6E56",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>
            Démarrer l'essai gratuit 🚀
          </button>
        </div>
      </div>
    </div>
  )
}

function Register({ onShowLogin }) {
  const [form, setForm] = useState({ name:"", email:"", password:"", phone:"", address:"" })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleRegister = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    if (form.password.length < 6) { setError("Le mot de passe doit faire au moins 6 caractères"); setLoading(false); return }

    // 1. Créer le compte auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })
    if (authError) { setError(authError.message); setLoading(false); return }

    // Attendre que l'user soit bien enregistré
await new Promise(resolve => setTimeout(resolve, 1500))
    // 2. Créer le tenant
    const slug = form.name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"") + "-" + Date.now()
    const trialEnd = new Date(); trialEnd.setMonth(trialEnd.getMonth() + 1)
    const { data: tenantData, error: tenantError } = await supabase.from("tenants").insert([{
      name: form.name, email: form.email, phone: form.phone,
      address: form.address, plan: "trial", slug, is_active: true,
      trial_ends_at: trialEnd.toISOString(),
    }]).select().single()
    if (tenantError) { setError(tenantError.message); setLoading(false); return }

    // Mettre à jour le tenant_id dans le profil
    await supabase.from("profiles").update({ tenant_id: tenantData.id }).eq("id", authData.user.id)
    
    setSuccess(true)
    setLoading(false)
  }

  if (success) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#F5F5F2",fontFamily:"sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:360,textAlign:"center",boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <div style={{fontSize:48,marginBottom:16}}>🎉</div>
        <div style={{fontSize:18,fontWeight:600,color:"#1A2E44",marginBottom:8}}>Compte créé !</div>
        <div style={{fontSize:13,color:"#888",marginBottom:8}}>Votre essai gratuit de 30 jours démarre maintenant.</div>
        <div style={{fontSize:12,color:"#aaa",marginBottom:24}}>Vérifiez vos emails pour confirmer votre compte.</div>
        <button onClick={onShowLogin} style={{width:"100%",padding:12,background:"#1A2E44",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>
          Se connecter
        </button>
      </div>
    </div>
  )

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#F5F5F2",fontFamily:"sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:360,boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{width:38,height:38,background:"#1A2E44",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="shield" size={22} color="#2DD4BF"/>
          </div>
          <div>
            <div style={{fontSize:18,fontWeight:600,color:"#1A2E44"}}>SnackSafe</div>
            <div style={{fontSize:11,color:"#888"}}>Essai gratuit 30 jours</div>
          </div>
        </div>
        <div style={{background:"#E1F5EE",borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:12,color:"#085041"}}>
          ✅ Aucune carte bancaire requise · 30 jours gratuits
        </div>
        {error && <div style={{background:"#FCEBEB",color:"#A32D2D",padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:13}}>{error}</div>}
        <form onSubmit={handleRegister}>
          {[
            { key:"name",     label:"Nom du restaurant *", type:"text",     ph:"Ex: Snack El Baraka" },
            { key:"email",    label:"Email *",             type:"email",    ph:"votre@email.com" },
            { key:"password", label:"Mot de passe *",      type:"password", ph:"6 caractères minimum" },
            { key:"phone",    label:"Téléphone",           type:"tel",      ph:"+33 6 XX XX XX XX" },
            { key:"address",  label:"Adresse",             type:"text",     ph:"123 rue de la Paix" },
          ].map(f => (
            <div key={f.key} style={{marginBottom:12}}>
              <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>{f.label}</label>
              <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}
                placeholder={f.ph} required={f.key==="name"||f.key==="email"||f.key==="password"}
                style={{width:"100%",padding:"10px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>
          ))}
          <button type="submit" disabled={loading} style={{width:"100%",padding:12,background:"#1A2E44",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:8}}>
            {loading ? "Création..." : "Démarrer l'essai gratuit 🚀"}
          </button>
        </form>
        <div style={{marginTop:16,textAlign:"center"}}>
          <button onClick={onShowLogin} style={{fontSize:13,color:"#888",background:"none",border:"none",cursor:"pointer"}}>
            Déjà un compte ? Se connecter
          </button>
        </div>
      </div>
    </div>
  )
}
export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showRegister, setShowRegister] = useState(false)
  const [trialExpired, setTrialExpired] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })
    supabase.auth.onAuthStateChange((_, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false); setTrialExpired(false) }
    })
  }, [])

  const loadProfile = async (userId) => {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single()
    if (profile?.tenant_id) {
      const { data: tenant } = await supabase.from("tenants").select("*").eq("id", profile.tenant_id).single()
      if (tenant?.plan === "trial" && tenant?.trial_ends_at) {
        const expired = new Date(tenant.trial_ends_at) < new Date()
        setTrialExpired(expired)
      }
    }
    setProfile(profile)
    setLoading(false)
  }

  const handleLogout = () => supabase.auth.signOut()

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:48,height:48,background:"#1A2E44",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
          <Icon name="shield" size={28} color="#2DD4BF"/>
        </div>
        <div style={{fontSize:14,color:"#888"}}>Chargement SnackSafe...</div>
      </div>
    </div>
  )

  if (!session) {
    if (showRegister) return <Register onShowLogin={() => setShowRegister(false)} />
    return <Login onShowRegister={() => setShowRegister(true)} />
  }

  if (trialExpired) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#F5F5F2",fontFamily:"sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:360,textAlign:"center",boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <div style={{fontSize:48,marginBottom:16}}>⏰</div>
        <div style={{fontSize:18,fontWeight:600,color:"#1A2E44",marginBottom:8}}>Essai gratuit terminé</div>
        <div style={{fontSize:13,color:"#888",marginBottom:24}}>Votre période d'essai de 30 jours est expirée. Contactez-nous pour continuer à utiliser SnackSafe.</div>
        <a href="mailto:nemri.jamel@gmail.com?subject=Abonnement SnackSafe" style={{display:"block",width:"100%",padding:12,background:"#1A2E44",color:"#fff",borderRadius:8,fontSize:14,fontWeight:600,textDecoration:"none",boxSizing:"border-box"}}>
          Nous contacter 📧
        </a>
        <button onClick={handleLogout} style={{marginTop:12,width:"100%",padding:12,background:"#F5F5F2",color:"#666",border:"none",borderRadius:8,fontSize:13,cursor:"pointer"}}>
          Déconnexion
        </button>
      </div>
    </div>
  )

  if (profile?.role === "super_admin") return <SuperAdmin session={session} onLogout={handleLogout} />
  return <ClientApp session={session} profile={profile} onLogout={handleLogout} />
}
