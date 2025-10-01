// TrustDose — Admin Console (React + Tailwind, self-contained)
// Features: Header, Tabs, Add Entity Modal (Doctor/Pharmacy/Logistics with Access ID), Shipments with Details Modal
// Put this file in: src/AdminDashboard.tsx — Requires: tailwindcss configured + lucide-react installed

import React, { useEffect, useMemo, useState } from 'react'
import {
  Users, Activity, Settings, TrendingUp, Shield, FileText, AlertCircle, Plus, Search, Sun, Moon, Bell,
  ChevronDown, Download, Filter, Building2, Stethoscope, Truck, Thermometer, ClipboardList, ChevronRight
} from 'lucide-react'

// ===================== Small UI primitives (Tailwind) =====================
function cx(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(' ') }

// Card
export function Card({ className, children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cx('rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900', className)}>{children}</div>
}
export function CardHeader({ className, children }: React.PropsWithChildren<{ className?: string }>) { return <div className={cx('p-5', className)}>{children}</div> }
export function CardTitle({ className, children }: React.PropsWithChildren<{ className?: string }>) { return <h3 className={cx('text-base font-semibold text-zinc-900 dark:text-zinc-50', className)}>{children}</h3> }
export function CardDescription({ className, children }: React.PropsWithChildren<{ className?: string }>) { return <p className={cx('mt-1 text-sm text-zinc-500 dark:text-zinc-400', className)}>{children}</p> }
export function CardContent({ className, children }: React.PropsWithChildren<{ className?: string }>) { return <div className={cx('p-5 pt-0', className)}>{children}</div> }

// Badge
export function Badge({ variant = 'default', className, children }: React.PropsWithChildren<{ variant?: 'default'|'secondary'|'outline'|'success'|'destructive'|'warning'|'info', className?: string }>) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
  const styles = {
    default: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
    secondary: 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
    outline: 'border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    destructive: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    info: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  } as const
  return <span className={cx(base, styles[variant], className)}>{children}</span>
}

// Button
export function Button({ variant = 'default', size = 'md', className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default'|'outline'|'ghost'|'secondary'|'primary'; size?: 'sm'|'md'|'lg' }) {
  const base = 'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none dark:focus:ring-zinc-700'
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-11 px-5 text-base' }
  const variants = {
    default: 'bg-zinc-900 text-white hover:bg-zinc-800 focus:ring-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200',
    primary: 'bg-violet-600 text-white hover:bg-violet-700 focus:ring-violet-300',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700',
    outline: 'border border-zinc-300 hover:bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800',
    ghost: 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800',
  }
  return <button className={cx(base, sizes[size], variants[variant], className)} {...props}>{children}</button>
}

// Table
export function Table({ className, children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cx('overflow-x-auto', className)}><table className="min-w-full border-separate border-spacing-y-2">{children}</table></div>
}
export function TableHeader({ children }: React.PropsWithChildren) { return <thead>{children}</thead> }
export function TableBody({ children }: React.PropsWithChildren) { return <tbody>{children}</tbody> }
export function TableRow(props: React.HTMLAttributes<HTMLTableRowElement> & { className?: string }) {
  const { className, children, ...rest } = props
  return <tr className={cx('bg-white dark:bg-zinc-900', className)} {...rest}>{children}</tr>
}
export function TableHead({ children }: React.PropsWithChildren) { return <th className="px-4 py-2 text-left text-xs font-semibold text-zinc-500">{children}</th> }
export function TableCell({ className, children }: React.PropsWithChildren<{ className?: string }>) { return <td className={cx('px-4 py-3 align-middle text-sm text-zinc-700 dark:text-zinc-200', className)}>{children}</td> }

// Dropdown (very small utility)
function Dropdown({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900" onClick={onClose}>
      {children}
    </div>
  )
}

// Modal
function Modal({ open, onClose, children, title }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

// ===================== Header (shell only) =====================
export type EntityType = 'User' | 'Pharmacy' | 'Doctor' | 'Logistics'
function Header({ onOpenAdd }: { onOpenAdd: (type: EntityType) => void }) {
  const [dark, setDark] = useState(false)
  useEffect(() => { const root = document.documentElement; dark ? root.classList.add('dark') : root.classList.remove('dark') }, [dark])
  const [dd, setDd] = useState(false)
  return (
    <div className="sticky top-0 z-40 mb-6 border-b border-zinc-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-7xl items-center gap-3 p-4">
      <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-50">
      <a href="/" className="flex items-center gap-2 text-zinc-900 dark:text-zinc-50">
      <img
        src="/TrustDose fi-01.png"
        alt="TrustDose"
        className="h-12 w-12 object-contain" 
        />
      <span className="text-base font-semibold hidden sm:inline"></span>
      </a>

        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 md:flex dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <Search className="h-4 w-4" />
            <input className="w-56 bg-transparent outline-none placeholder:text-zinc-400" placeholder="Search…" />
          </div>
          <div className="relative">
            <Button variant="primary" size="sm" onClick={() => setDd(!dd)}><Plus className="mr-2 h-4 w-4" /> Add</Button>
            <Dropdown open={dd} onClose={() => setDd(false)}>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => onOpenAdd('Pharmacy')}><Building2 className="h-4 w-4"/> Pharmacy</button>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => onOpenAdd('Doctor')}><Stethoscope className="h-4 w-4"/> Doctor</button>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => onOpenAdd('Logistics')}><Truck className="h-4 w-4"/> Logistics</button>
            </Dropdown>
          </div>
          <Button variant="ghost" size="sm" aria-label="Notifications"><Bell className="h-5 w-5" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setDark(v => !v)} aria-label="Toggle theme">{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</Button>
          <Button variant="outline" size="sm" className="gap-2"><div className="grid h-6 w-6 place-items-center rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100">FT</div><span className="hidden sm:inline">Account</span><ChevronDown className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  )
}

// ===================== Admin Console =====================
// --- Domain types (fix TS accessId errors) ---
type Pharmacy = { id: number; name: string; license: string; city: string; status: 'Active' | 'Pending' | 'Suspended'; accessId?: string }
type Doctor = { id: number; name: string; specialty: string; regId: string; status: 'Active' | 'Suspended' | 'Pending'; accessId?: string }
type LogisticsPartner = { id: number; company: string; contact: string; sla: string; active: boolean; accessId?: string }

export default function AdminDashboard() {
  type Tab = 'overview' | 'users' | 'pharmacies' | 'doctors' | 'logistics' | 'shipments' | 'logs' | 'alerts' | 'reports'
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Overview widgets
  const stats = useMemo(() => ([
    { title: 'Total Users', value: '1,284', change: '+12.5%', icon: Users, trend: 'up' as const },
    { title: 'Active Sessions', value: '342', change: '+5.2%', icon: Activity, trend: 'up' as const },
    { title: 'System Health', value: '98.5%', change: '+0.3%', icon: TrendingUp, trend: 'up' as const },
    { title: 'Security Alerts', value: '3', change: '-2', icon: Shield, trend: 'down' as const },
  ]), [])

  const systemLogs = [
    { id: 1, action: 'User login', user: 'sarah.j@example.com', time: '2 minutes ago', severity: 'info' as const },
    { id: 2, action: 'Database backup completed', user: 'System', time: '15 minutes ago', severity: 'success' as const },
    { id: 3, action: 'Failed login attempt', user: 'unknown@example.com', time: '1 hour ago', severity: 'warning' as const },
    { id: 4, action: 'Settings updated', user: 'admin@example.com', time: '2 hours ago', severity: 'info' as const },
  ]

  // Domain data (stateful)
  const [users, setUsers] = useState([
    { id: 1, name: 'Sarah Johnson', email: 'sarah.j@example.com', role: 'Admin', status: 'Active', joined: '2024-03-15' },
    { id: 2, name: 'Mike Chen', email: 'mike.c@example.com', role: 'User', status: 'Active', joined: '2024-03-14' },
    { id: 3, name: 'Emma Wilson', email: 'emma.w@example.com', role: 'Moderator', status: 'Active', joined: '2024-03-13' },
  ])
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([
    { id: 101, name: 'Riyadh Central Pharmacy', license: 'PH-0192', city: 'Riyadh', status: 'Active' },
    { id: 102, name: 'North Gate Pharmacy', license: 'PH-0220', city: 'Jeddah', status: 'Pending' },
  ])
  const [doctors, setDoctors] = useState<Doctor[]>([
    { id: 201, name: 'Dr. Aisha Al-Qahtani', specialty: 'Cardiology', regId: 'MOH-8812', status: 'Active' },
    { id: 202, name: 'Dr. Omar Al-Harbi', specialty: 'Endocrinology', regId: 'MOH-7721', status: 'Suspended' },
  ])
  const [logistics, setLogistics] = useState<LogisticsPartner[]>([
    { id: 301, company: 'MedExpress', contact: 'ops@medexpress.com', sla: '2h @ 2–8°C', active: true },
    { id: 302, company: 'HealthGo', contact: 'fleet@healthgo.com', sla: '3h @ 2–8°C', active: true },
  ])

  type Shipment = {
    id: string; rxId: string; drug: string; from: string; to: string; carrier: string;
    tempMin: number; tempMax: number; lastTemp: number; status: 'Preparing'|'In Transit'|'Delivered'|'Breach'; progress: number; updated: string
  }
  const [shipments] = useState<Shipment[]>([
    { id: 'SHP-88412', rxId: 'RX-983112', drug: 'Insulin Glargine', from: 'Riyadh Central Pharmacy', to: 'Patient #10212', carrier: 'MedExpress', tempMin: 2, tempMax: 8, lastTemp: 5.2, status: 'In Transit', progress: 62, updated: '2m ago' },
    { id: 'SHP-88433', rxId: 'RX-983224', drug: 'Vacc. MMR', from: 'North Gate Pharmacy', to: 'Patient #10388', carrier: 'HealthGo', tempMin: 2, tempMax: 8, lastTemp: 12.9, status: 'Breach', progress: 41, updated: '8m ago' },
    { id: 'SHP-88457', rxId: 'RX-983311', drug: 'Erythropoietin', from: 'Riyadh Central Pharmacy', to: 'Patient #10401', carrier: 'MedExpress', tempMin: 2, tempMax: 8, lastTemp: 4.1, status: 'Delivered', progress: 100, updated: '10m ago' },
  ])

  // Selected Shipment (Details Modal)
  type ShipmentEvent = { time: string; location: string; temp: number; status: string }
  const shipmentEvents: Record<string, ShipmentEvent[]> = {
    'SHP-88412': [
      { time: '2025-09-30 14:10', location: 'Warehouse Riyadh', temp: 5.0, status: 'Packed' },
      { time: '2025-09-30 15:40', location: 'Truck #22', temp: 6.1, status: 'Departed' },
      { time: '2025-09-30 18:15', location: 'Checkpoint North', temp: 6.8, status: 'In Transit' },
      { time: '2025-09-30 20:10', location: 'Ring Road Exit', temp: 5.9, status: 'In Transit' },
    ],
    'SHP-88433': [
      { time: '2025-09-30 14:20', location: 'Warehouse Jeddah', temp: 7.5, status: 'Packed' },
      { time: '2025-09-30 16:00', location: 'Truck #5', temp: 9.2, status: 'Departed' },
      { time: '2025-09-30 18:30', location: 'Highway Checkpoint', temp: 12.9, status: 'Breach detected' },
    ],
    'SHP-88457': [
      { time: '2025-09-30 09:10', location: 'Warehouse Riyadh', temp: 4.8, status: 'Packed' },
      { time: '2025-09-30 10:30', location: 'Truck #19', temp: 5.2, status: 'Departed' },
      { time: '2025-09-30 12:10', location: 'City Center', temp: 4.9, status: 'Delivered' },
    ],
  }
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)

  // Add-entity modal state
  const [isAddOpen, setIsAddOpen] = useState(false)
  function genAccessId(){ return 'AC-' + Math.random().toString(36).slice(2,8).toUpperCase() }
  const [entityType, setEntityType] = useState<EntityType>('Doctor')
  const [form, setForm] = useState<any>({ name: '', email: '', role: 'User', status: 'Active', license: '', city: '', specialty: '', regId: '', company: '', contact: '', sla: '2h @ 2–8°C', accessId: genAccessId() })
  const resetForm = () => setForm({ name: '', email: '', role: 'User', status: 'Active', license: '', city: '', specialty: '', regId: '', company: '', contact: '', sla: '2h @ 2–8°C', accessId: genAccessId() })

  const onSubmitAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (entityType === 'Pharmacy') {
      const id = pharmacies.length ? Math.max(...pharmacies.map(p => p.id)) + 1 : 100
      setPharmacies([{ id, name: form.name, license: form.license, city: form.city, status: 'Pending', accessId: form.accessId }, ...pharmacies])
      setActiveTab('pharmacies')
    } else if (entityType === 'Doctor') {
      const id = doctors.length ? Math.max(...doctors.map(d => d.id)) + 1 : 200
      setDoctors([{ id, name: form.name, specialty: form.specialty, regId: form.regId, status: 'Active', accessId: form.accessId }, ...doctors])
      setActiveTab('doctors')
    } else if (entityType === 'Logistics') {
      const id = logistics.length ? Math.max(...logistics.map(l => l.id)) + 1 : 300
      setLogistics([{ id, company: form.company, contact: form.contact, sla: form.sla, active: true, accessId: form.accessId }, ...logistics])
      setActiveTab('logistics')
    }
    resetForm(); setIsAddOpen(false)
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header onOpenAdd={(type) => { setEntityType(type); setIsAddOpen(true); }} />

      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-3xl">Admin Console</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 md:text-base">Manage identities & compliance, and monitor medicine transfers</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" />Export</Button>
            <Button variant="primary" size="sm"><Settings className="mr-2 h-4 w-4" />Settings</Button>
          </div>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <Card key={i} className="border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-zinc-700 dark:text-zinc-300">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-violet-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{stat.value}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={stat.trend==='up'?'success':'warning'}>{stat.change}</Badge>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">from last month</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800">
          {(([
            ['overview','Overview'],['users','Users'],['pharmacies','Pharmacies'],['doctors','Doctors'],['logistics','Logistics'],['shipments','Shipments'],['logs','System Logs'],['alerts','Alerts'],['reports','Reports']
          ]) as Array<[Tab,string]>).map(([key,label]) => (
            <Button key={key} variant={activeTab===key?'primary':'ghost'} onClick={()=>setActiveTab(key as Tab)} className="rounded-b-none">{label}</Button>
          ))}
        </div>

        {/* USERS */}
        {activeTab==='users' && (
          <Card>
            <CardHeader><CardTitle>Users</CardTitle><CardDescription>Accounts & roles</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"><Search className="h-4 w-4" /><input className="w-56 bg-transparent outline-none placeholder:text-zinc-400" placeholder="Search users…" /></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={()=>{setEntityType('Doctor'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Doctor</Button>
                  <Button size="sm" variant="outline" onClick={()=>{setEntityType('Pharmacy'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Pharmacy</Button>
                  <Button size="sm" variant="outline" onClick={()=>{setEntityType('Logistics'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Logistics</Button>
                </div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}><TableCell className="font-medium">{u.name}</TableCell><TableCell>{u.email}</TableCell><TableCell><Badge variant="secondary">{u.role}</Badge></TableCell><TableCell><Badge variant={u.status==='Active'?'success':'outline'}>{u.status}</Badge></TableCell><TableCell className="text-zinc-500 dark:text-zinc-400">{u.joined}</TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="ghost">Edit</Button><Button size="sm" variant="ghost">Delete</Button></div></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* PHARMACIES */}
        {activeTab==='pharmacies' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-violet-600"/><CardTitle>Pharmacies</CardTitle></div><CardDescription>Licensing & status</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex justify-end"><Button size="sm" variant="primary" onClick={()=>{setEntityType('Pharmacy'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Pharmacy</Button></div>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>License</TableHead><TableHead>City</TableHead><TableHead>Access ID</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pharmacies.map(p => (
                    <TableRow key={p.id}><TableCell className="font-medium">{p.name}</TableCell><TableCell>{p.license}</TableCell><TableCell>{p.city}</TableCell><TableCell className="font-mono text-xs">{p.accessId}</TableCell><TableCell><Badge variant={p.status==='Active'?'success':p.status==='Pending'?'warning':'outline'}>{p.status}</Badge></TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="ghost">View</Button><Button size="sm" variant="ghost">Suspend</Button></div></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* DOCTORS */}
        {activeTab==='doctors' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-violet-600"/><CardTitle>Doctors</CardTitle></div><CardDescription>Registration & practice</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex justify-end"><Button size="sm" variant="primary" onClick={()=>{setEntityType('Doctor'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Doctor</Button></div>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Specialty</TableHead><TableHead>MOH Reg</TableHead><TableHead>Access ID</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {doctors.map(d => (
                    <TableRow key={d.id}><TableCell className="font-medium">{d.name}</TableCell><TableCell>{d.specialty}</TableCell><TableCell>{d.regId}</TableCell><TableCell className="font-mono text-xs">{d.accessId}</TableCell><TableCell><Badge variant={d.status==='Active'?'success':d.status==='Suspended'?'destructive':'outline'}>{d.status}</Badge></TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="ghost">View</Button><Button size="sm" variant="ghost">Suspend</Button></div></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* LOGISTICS */}
        {activeTab==='logistics' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Truck className="h-5 w-5 text-violet-600"/><CardTitle>Logistics Partners</CardTitle></div><CardDescription>Fleet & SLA</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex justify-end"><Button size="sm" variant="primary" onClick={()=>{setEntityType('Logistics'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Partner</Button></div>
              <Table>
                <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Contact</TableHead><TableHead>SLA</TableHead><TableHead>Access ID</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {logistics.map(l => (
                    <TableRow key={l.id}><TableCell className="font-medium">{l.company}</TableCell><TableCell>{l.contact}</TableCell><TableCell>{l.sla}</TableCell><TableCell className="font-mono text-xs">{l.accessId}</TableCell><TableCell><Badge variant={l.active?'success':'outline'}>{l.active?'Active':'Inactive'}</Badge></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* SHIPMENTS — cold-chain tracking */}
        {activeTab==='shipments' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Thermometer className="h-5 w-5 text-violet-600"/><CardTitle>Medicine Shipments</CardTitle></div><CardDescription>Track per-prescription transfers and temperature</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Shipment</TableHead><TableHead>RX / Drug</TableHead><TableHead>Route</TableHead><TableHead>Carrier</TableHead><TableHead>Temp (°C)</TableHead><TableHead>Status</TableHead><TableHead>Progress</TableHead></TableRow></TableHeader>
                <TableBody>
                  {shipments.map(s => (
                    <TableRow key={s.id} onClick={() => setSelectedShipment(s)} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <TableCell className="font-medium">{s.id}</TableCell>
                      <TableCell><span className="font-medium">{s.rxId}</span> — {s.drug}</TableCell>
                      <TableCell>{s.from} <ChevronRight className="mx-1 inline h-4 w-4 align-middle"/> {s.to}</TableCell>
                      <TableCell>{s.carrier}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2"><Badge variant={s.lastTemp> s.tempMax || s.lastTemp < s.tempMin ? 'destructive':'success'}>{s.lastTemp.toFixed(1)}°</Badge><span className="text-xs text-zinc-500">range {s.tempMin}–{s.tempMax}°</span></div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status==='Breach'?'destructive':s.status==='Delivered'?'success':s.status==='In Transit'?'info':'outline'}>{s.status}</Badge>
                        <div className="text-xs text-zinc-500">{s.updated}</div>
                      </TableCell>
                      <TableCell>
                        <div className="h-2 w-40 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"><div className={cx('h-full', s.status==='Breach'?'bg-rose-500':s.status==='Delivered'?'bg-emerald-500':'bg-violet-500')} style={{width: `${s.progress}%`}}/></div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* LOGS */}
        {activeTab==='logs' && (
          <Card>
            <CardHeader><CardTitle>System Logs</CardTitle><CardDescription>Monitor system events and security alerts</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center gap-2 text-sm"><Filter className="h-4 w-4" /><span className="text-zinc-500">Filter by severity, date, user (coming soon)</span></div>
              <div className="space-y-3">
                {systemLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
                    <div className="flex items-center gap-3">
                      <AlertCircle className={cx('h-5 w-5', log.severity === 'warning' ? 'text-amber-500' : log.severity === 'success' ? 'text-emerald-500' : 'text-violet-600')} />
                      <div><p className="font-medium text-zinc-900 dark:text-zinc-50">{log.action}</p><p className="text-sm text-zinc-500 dark:text-zinc-400">{log.user}</p></div>
                    </div>
                    <div className="text-right"><Badge variant="outline" className="text-xs capitalize">{log.severity}</Badge><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{log.time}</p></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ALERTS */}
        {activeTab==='alerts' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Shield className="h-5 w-5 text-violet-600"/><CardTitle>Alerts</CardTitle></div><CardDescription>Security & cold-chain alerts</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[{id:1, level:'High', type:'Temperature', msg:'Cold-chain breach on RX-983224'}, {id:2, level:'Medium', type:'Auth', msg:'5 failed login attempts (pharmacy-ops)'}].map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-center gap-3"><Badge variant={a.level==='High'?'destructive':'warning'}>{a.level}</Badge><div><p className="font-medium text-zinc-900 dark:text-zinc-50">{a.type}</p><p className="text-sm text-zinc-500 dark:text-zinc-400">{a.msg}</p></div></div>
                    <Button size="sm" variant="ghost">Acknowledge</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* REPORTS */}
        {activeTab==='reports' && (
          <Card>
            <CardHeader><CardTitle>Reports</CardTitle><CardDescription>Generate & export datasets</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm"><Download className="mr-2 h-4 w-4" /> Export Users CSV</Button>
                <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" /> Prescriptions PDF</Button>
                <Button variant="outline" size="sm"><ClipboardList className="mr-2 h-4 w-4" /> Monthly Summary</Button>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">(Placeholder) Wire these to Firestore/Chain later.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add-Entity Modal */}
      <Modal open={isAddOpen} onClose={()=>setIsAddOpen(false)} title={`Add ${entityType}`}>
        <form onSubmit={onSubmitAdd} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">Entity type</label>
              <select value={entityType} onChange={e=>setEntityType(e.target.value as EntityType)} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option>Doctor</option>
                <option>Pharmacy</option>
                <option>Logistics</option>
              </select>
            </div>
            <div/>
          </div>

          {/* Dynamic fields */}
          {entityType==='Pharmacy' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">Name</label><input required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div>
              <div><label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">License</label><input required value={form.license} onChange={e=>setForm({...form, license:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div>
              <div><label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">City</label><input required value={form.city} onChange={e=>setForm({...form, city:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">Access ID</label>
                <div className="flex gap-2">
                  <input readOnly value={form.accessId} className="w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                  <Button type="button" variant="outline" onClick={() => setForm((f:any)=>({...f, accessId: genAccessId()}))}>Regenerate</Button>
                </div>
              </div>
            </div>
          )}

          {entityType==='Doctor' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">Name</label><input required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div>
              <div><label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">Specialty</label><input required value={form.specialty} onChange={e=>setForm({...form, specialty:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div>
              <div><label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">MOH Reg</label><input required value={form.regId} onChange={e=>setForm({...form, regId:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">Access ID</label>
                <div className="flex gap-2">
                  <input readOnly value={form.accessId} className="w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                  <Button type="button" variant="outline" onClick={() => setForm((f:any)=>({...f, accessId: genAccessId()}))}>Regenerate</Button>
                </div>
              </div>
            </div>
          )}

          {entityType==='Logistics' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">Company</label><input required value={form.company} onChange={e=>setForm({...form, company:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div>
              <div><label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">Contact</label><input required value={form.contact} onChange={e=>setForm({...form, contact:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div>
              <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">SLA</label><input required value={form.sla} onChange={e=>setForm({...form, sla:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">Access ID</label>
                <div className="flex gap-2">
                  <input readOnly value={form.accessId} className="w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                  <Button type="button" variant="outline" onClick={() => setForm((f:any)=>({...f, accessId: genAccessId()}))}>Regenerate</Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={()=>setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save</Button>
          </div>
        </form>
      </Modal>

      {/* Shipment Details Modal */}
      <Modal open={!!selectedShipment} onClose={()=>setSelectedShipment(null)} title={`Shipment ${selectedShipment?.id ?? ''} — ${selectedShipment?.rxId ?? ''}`}>
        {selectedShipment && (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="text-sm text-zinc-600 dark:text-zinc-300">
                <div><span className="font-medium text-zinc-900 dark:text-zinc-50">Drug:</span> {selectedShipment.drug}</div>
                <div><span className="font-medium text-zinc-900 dark:text-zinc-50">Carrier:</span> {selectedShipment.carrier}</div>
                <div><span className="font-medium text-zinc-900 dark:text-zinc-50">Route:</span> {selectedShipment.from} → {selectedShipment.to}</div>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-300">
                <div className="mb-1">Temperature</div>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedShipment.lastTemp> selectedShipment.tempMax || selectedShipment.lastTemp < selectedShipment.tempMin ? 'destructive' : 'success'}>
                    {selectedShipment.lastTemp.toFixed(1)}°C
                  </Badge>
                  <span className="text-xs text-zinc-500">Range {selectedShipment.tempMin}–{selectedShipment.tempMax}°C</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div className={cx('h-full', selectedShipment.status==='Breach'?'bg-rose-500':selectedShipment.status==='Delivered'?'bg-emerald-500':'bg-violet-500')} style={{width: `${selectedShipment.progress}%`}}></div>
                </div>
                <div className="mt-1 text-xs text-zinc-500">Status: {selectedShipment.status} • {selectedShipment.updated}</div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">Timeline</div>
              <div className="border-l-2 border-violet-500 pl-4">
                {(shipmentEvents[selectedShipment.id] || []).map((e, idx) => {
                  const outOfRange = e.temp > selectedShipment.tempMax || e.temp < selectedShipment.tempMin
                  return (
                    <div key={idx} className="mb-4">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{e.time} — {e.location}</p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {e.status}
                        <span className={cx('ml-2', outOfRange ? 'text-rose-600' : 'text-violet-600')}>{e.temp.toFixed(1)}°C</span>
                      </p>
                    </div>
                  )
                })}
                {(!shipmentEvents[selectedShipment.id] || shipmentEvents[selectedShipment.id].length===0) && (
                  <p className="text-sm text-zinc-500">No events yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
