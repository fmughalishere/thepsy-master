import { useState, useEffect } from "react";
import {
    collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc,
    doc, Timestamp, getDocs, where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    Plus, Edit, Trash2, ToggleLeft, ToggleRight, Tag, TrendingUp,
    Users, DollarSign, Search, Filter, RefreshCw, Copy, Check
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Coupon, DiscountType, CustomerRestriction, CouponStatus } from "@/types/payment";

const EMPTY_COUPON: Omit<Coupon, 'id'> = {
    code: '',
    name: '',
    description: '',
    discount_type: 'percentage',
    discount_value: 10,
    status: 'active',
    start_date: new Date().toISOString().split('T')[0],
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_restriction: 'all',
    one_time_per_customer: true,
    max_redemptions: null,
    max_per_customer: null,
    unlimited_usage: true,
    applicable_plans: 'all',
    min_order_value: 0,
    source: '',
    total_redemptions: 0,
    total_discount_given: 0,
};

const CouponManagement = () => {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [showDialog, setShowDialog] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
    const [formData, setFormData] = useState<Omit<Coupon, 'id'>>(EMPTY_COUPON);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, 'coupons'), orderBy('created_at', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const filteredCoupons = coupons.filter(c => {
        const matchSearch = c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.source || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchStatus = statusFilter === 'all' || c.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const openCreate = () => {
        setEditingCoupon(null);
        setFormData(EMPTY_COUPON);
        setShowDialog(true);
    };

    const openEdit = (coupon: Coupon) => {
        setEditingCoupon(coupon);
        setFormData({ ...coupon });
        setShowDialog(true);
    };

    const handleSave = async () => {
        if (!formData.code.trim()) { toast.error('Coupon code is required'); return; }
        if (!formData.discount_value || formData.discount_value <= 0) { toast.error('Discount value must be greater than 0'); return; }
        if (!formData.start_date || !formData.expiry_date) { toast.error('Start and expiry dates are required'); return; }
        if (new Date(formData.expiry_date) <= new Date(formData.start_date)) { toast.error('Expiry date must be after start date'); return; }

        setSaving(true);
        try {
            const data = {
                ...formData,
                code: formData.code.trim().toUpperCase(),
                max_redemptions: formData.unlimited_usage ? null : (formData.max_redemptions || null),
                applicable_plans: formData.applicable_plans,
            };

            if (editingCoupon?.id) {
                await updateDoc(doc(db, 'coupons', editingCoupon.id), data);
                toast.success('Coupon updated successfully');
            } else {
                await addDoc(collection(db, 'coupons'), {
                    ...data,
                    created_at: new Date().toISOString(),
                    total_redemptions: 0,
                    total_discount_given: 0,
                });
                toast.success('Coupon created successfully');
            }
            setShowDialog(false);
        } catch (err) {
            toast.error('Failed to save coupon');
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (coupon: Coupon) => {
        if (!coupon.id) return;
        const newStatus: CouponStatus = coupon.status === 'active' ? 'inactive' : 'active';
        try {
            await updateDoc(doc(db, 'coupons', coupon.id), { status: newStatus });
            toast.success(`Coupon ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
        } catch { toast.error('Failed to update status'); }
    };

    const deleteCoupon = async (id: string) => {
        try {
            await deleteDoc(doc(db, 'coupons', id));
            toast.success('Coupon deleted');
        } catch { toast.error('Failed to delete coupon'); }
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    // Stats
    const totalActive = coupons.filter(c => c.status === 'active').length;
    const totalRedemptions = coupons.reduce((sum, c) => sum + (c.total_redemptions || 0), 0);
    const totalDiscounted = coupons.reduce((sum, c) => sum + (c.total_discount_given || 0), 0);

    const isExpired = (coupon: Coupon) => new Date(coupon.expiry_date) < new Date();

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-1">Coupon Management</h1>
                    <p className="text-sm text-gray-500">Create and manage discount coupons for your plans</p>
                </div>
                <Button onClick={openCreate} className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white gap-2">
                    <Plus className="w-4 h-4" /> New Coupon
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Coupons', value: coupons.length, icon: Tag, color: 'text-blue-500' },
                    { label: 'Active', value: totalActive, icon: ToggleRight, color: 'text-green-500' },
                    { label: 'Total Redemptions', value: totalRedemptions, icon: Users, color: 'text-purple-500' },
                    { label: 'Total Discounted', value: `€${totalDiscounted.toFixed(2)}`, icon: DollarSign, color: 'text-orange-500' },
                ].map(stat => (
                    <Card key={stat.label} className="p-4">
                        <div className="flex items-center gap-3">
                            <stat.icon className={`w-8 h-8 ${stat.color}`} />
                            <div>
                                <p className="text-2xl font-bold">{stat.value}</p>
                                <p className="text-xs text-gray-500">{stat.label}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b">
                {(['list', 'analytics'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab
                            ? 'border-[#92C7CF] text-[#92C7CF]'
                            : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        {tab === 'list' ? 'Coupons List' : 'Analytics'}
                    </button>
                ))}
            </div>

            {activeTab === 'list' && (
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    placeholder="Search by code, name, or source..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                                <SelectTrigger className="w-40">
                                    <Filter className="w-4 h-4 mr-2" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Discount</TableHead>
                                        <TableHead>Validity</TableHead>
                                        <TableHead>Usage</TableHead>
                                        <TableHead>Source</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8">
                                                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-gray-400" />
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredCoupons.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                                                No coupons found
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredCoupons.map(coupon => (
                                        <TableRow key={coupon.id} className={isExpired(coupon) ? 'opacity-60' : ''}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-[#92C7CF]">{coupon.code}</span>
                                                    <button onClick={() => copyCode(coupon.code)} className="text-gray-400 hover:text-gray-600">
                                                        {copiedCode === coupon.code ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                                {coupon.name && <p className="text-xs text-gray-500 mt-0.5">{coupon.name}</p>}
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-semibold text-green-600">
                                                    {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `€${coupon.discount_value}`}
                                                </span>
                                                <p className="text-xs text-gray-400 capitalize">{coupon.discount_type}</p>
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-xs">{format(new Date(coupon.start_date), 'dd MMM yyyy')}</p>
                                                <p className="text-xs text-gray-500">→ {format(new Date(coupon.expiry_date), 'dd MMM yyyy')}</p>
                                                {isExpired(coupon) && <Badge variant="outline" className="text-red-500 border-red-200 text-xs mt-1">Expired</Badge>}
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-sm font-medium">{coupon.total_redemptions || 0} used</p>
                                                <p className="text-xs text-gray-500">
                                                    {coupon.unlimited_usage ? 'Unlimited' : `of ${coupon.max_redemptions}`}
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                {coupon.source ? (
                                                    <Badge variant="outline" className="text-purple-600 border-purple-200 text-xs">{coupon.source}</Badge>
                                                ) : <span className="text-gray-400 text-xs">—</span>}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={coupon.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>
                                                    {coupon.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => openEdit(coupon)} className="h-8 w-8 p-0">
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => toggleStatus(coupon)}
                                                        className={`h-8 w-8 p-0 ${coupon.status === 'active' ? 'text-orange-500' : 'text-green-500'}`}>
                                                        {coupon.status === 'active' ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                                                    </Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500">
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Delete Coupon?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Are you sure you want to delete <strong>{coupon.code}</strong>? This cannot be undone.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => deleteCoupon(coupon.id!)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'analytics' && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader><CardTitle>Coupon Performance</CardTitle></CardHeader>
                        <CardContent>
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Coupon</TableHead>
                                            <TableHead>Source</TableHead>
                                            <TableHead>Redemptions</TableHead>
                                            <TableHead>Total Discounted</TableHead>
                                            <TableHead>Remaining Uses</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {coupons.map(coupon => (
                                            <TableRow key={coupon.id}>
                                                <TableCell>
                                                    <p className="font-mono font-bold">{coupon.code}</p>
                                                    <p className="text-xs text-gray-500">{coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `€${coupon.discount_value}`} off</p>
                                                </TableCell>
                                                <TableCell>
                                                    {coupon.source || <span className="text-gray-400">—</span>}
                                                </TableCell>
                                                <TableCell className="font-semibold">{coupon.total_redemptions || 0}</TableCell>
                                                <TableCell className="font-semibold text-red-500">
                                                    -€{(coupon.total_discount_given || 0).toFixed(2)}
                                                </TableCell>
                                                <TableCell>
                                                    {coupon.unlimited_usage ? (
                                                        <Badge variant="outline">Unlimited</Badge>
                                                    ) : (
                                                        <span>{Math.max(0, (coupon.max_redemptions || 0) - (coupon.total_redemptions || 0))} left</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={coupon.status === 'active' && !isExpired(coupon) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>
                                                        {isExpired(coupon) ? 'Expired' : coupon.status}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-5 py-2">
                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 sm:col-span-1">
                                <Label>Coupon Code *</Label>
                                <Input
                                    placeholder="e.g. WELCOME10"
                                    value={formData.code}
                                    onChange={e => setFormData(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                                    className="uppercase font-mono mt-1"
                                />
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <Label>Internal Name</Label>
                                <Input
                                    placeholder="e.g. Welcome discount"
                                    value={formData.name || ''}
                                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Description (optional)</Label>
                            <Input
                                placeholder="Internal notes about this coupon"
                                value={formData.description || ''}
                                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                                className="mt-1"
                            />
                        </div>

                        {/* Discount */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Discount Type *</Label>
                                <Select value={formData.discount_type} onValueChange={(v: DiscountType) => setFormData(p => ({ ...p, discount_type: v }))}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                                        <SelectItem value="fixed">Fixed Amount (€)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Discount Value *</Label>
                                <Input
                                    type="number" min="0"
                                    placeholder={formData.discount_type === 'percentage' ? '10' : '20'}
                                    value={formData.discount_value || ''}
                                    onChange={e => setFormData(p => ({ ...p, discount_value: parseFloat(e.target.value) || 0 }))}
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Start Date *</Label>
                                <Input type="date" value={formData.start_date} onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))} className="mt-1" />
                            </div>
                            <div>
                                <Label>Expiry Date *</Label>
                                <Input type="date" value={formData.expiry_date} onChange={e => setFormData(p => ({ ...p, expiry_date: e.target.value }))} className="mt-1" />
                            </div>
                        </div>

                        {/* Customer Restrictions */}
                        <div>
                            <Label>Customer Restriction</Label>
                            <Select value={formData.customer_restriction} onValueChange={(v: CustomerRestriction) => setFormData(p => ({ ...p, customer_restriction: v }))}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Customers</SelectItem>
                                    <SelectItem value="new">New Customers Only</SelectItem>
                                    <SelectItem value="existing">Existing Customers Only</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="font-medium text-sm">One-time use per customer</p>
                                <p className="text-xs text-gray-500">Customer can only use this coupon once</p>
                            </div>
                            <Switch
                                checked={formData.one_time_per_customer}
                                onCheckedChange={v => setFormData(p => ({ ...p, one_time_per_customer: v }))}
                            />
                        </div>

                        {/* Usage Limits */}
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="font-medium text-sm">Unlimited Usage</p>
                                <p className="text-xs text-gray-500">No limit on total redemptions</p>
                            </div>
                            <Switch
                                checked={formData.unlimited_usage}
                                onCheckedChange={v => setFormData(p => ({ ...p, unlimited_usage: v }))}
                            />
                        </div>

                        {!formData.unlimited_usage && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Max Total Redemptions</Label>
                                    <Input
                                        type="number" min="1"
                                        placeholder="e.g. 100"
                                        value={formData.max_redemptions || ''}
                                        onChange={e => setFormData(p => ({ ...p, max_redemptions: parseInt(e.target.value) || null }))}
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label>Max Per Customer</Label>
                                    <Input
                                        type="number" min="1"
                                        placeholder="e.g. 1"
                                        value={formData.max_per_customer || ''}
                                        onChange={e => setFormData(p => ({ ...p, max_per_customer: parseInt(e.target.value) || null }))}
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Package Restrictions */}
                        <div>
                            <Label>Applicable Plans</Label>
                            <Select
                                value={formData.applicable_plans === 'all' ? 'all' : 'specific'}
                                onValueChange={v => setFormData(p => ({ ...p, applicable_plans: v === 'all' ? 'all' : [] }))}
                            >
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Plans</SelectItem>
                                    <SelectItem value="specific">Specific Plans (enter IDs below)</SelectItem>
                                </SelectContent>
                            </Select>
                            {formData.applicable_plans !== 'all' && (
                                <Input
                                    placeholder="Plan IDs comma-separated, e.g. basic_plan,plus_weekly"
                                    value={Array.isArray(formData.applicable_plans) ? formData.applicable_plans.join(',') : ''}
                                    onChange={e => setFormData(p => ({ ...p, applicable_plans: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                                    className="mt-2"
                                />
                            )}
                        </div>

                        {/* Min Order */}
                        <div>
                            <Label>Minimum Order Value (€)</Label>
                            <Input
                                type="number" min="0" step="0.01"
                                placeholder="0 = no minimum"
                                value={formData.min_order_value || ''}
                                onChange={e => setFormData(p => ({ ...p, min_order_value: parseFloat(e.target.value) || 0 }))}
                                className="mt-1"
                            />
                        </div>

                        {/* Source Tracking */}
                        <div>
                            <Label>Source / Campaign (optional)</Label>
                            <Input
                                placeholder="e.g. influencer_name, summer_campaign, referral"
                                value={formData.source || ''}
                                onChange={e => setFormData(p => ({ ...p, source: e.target.value }))}
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-400 mt-1">Used for tracking where clients are coming from</p>
                        </div>

                        {/* Status */}
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="font-medium text-sm">Active Status</p>
                                <p className="text-xs text-gray-500">Coupon can be used when active</p>
                            </div>
                            <Switch
                                checked={formData.status === 'active'}
                                onCheckedChange={v => setFormData(p => ({ ...p, status: v ? 'active' : 'inactive' }))}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving} className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white">
                            {saving ? 'Saving...' : editingCoupon ? 'Update Coupon' : 'Create Coupon'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default CouponManagement;
