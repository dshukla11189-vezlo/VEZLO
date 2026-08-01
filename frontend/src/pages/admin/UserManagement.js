import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { 
  Users, Plus, Edit, Trash2, Shield, UserCheck, Store, 
  Search, Eye, EyeOff, Mail, Phone, X, MapPin, ChevronDown, ChevronUp
} from 'lucide-react';

const ROLE_CONFIG = {
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700', icon: Shield },
  staff: { label: 'Staff', color: 'bg-blue-100 text-blue-700', icon: UserCheck },
  retailer: { label: 'Retailer', color: 'bg-green-100 text-green-700', icon: Store },
  field_team: { label: 'Field Team', color: 'bg-orange-100 text-orange-700', icon: Users }
};

export default function UserManagement() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff',
    contact: '',
    company_name: '',
    address: '',
    city: '',
    // Retailer-specific fields
    area: '',
    state: '',
    zone: '',
    latitude: '',
    longitude: '',
    category: '',
    shop_type: '',
    shop_type_remark: '',
    assigned_to: '',
    commission_percentage: 0,
    upfront_collection_percentage: 50,
    model_changed_at: '',
    status: 'active'
  });
  
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});  // Track which rows are expanded

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);
  
  const loadAssignableUsers = useCallback(async () => {
    try {
      const response = await api.get('/api/assignable-users');
      setAssignableUsers(response.data);
    } catch (error) {
      console.error('Failed to load assignable users:', error);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadAssignableUsers();
  }, [loadUsers, loadAssignableUsers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email) {
      toast.error('Name and email are required');
      return;
    }

    if (!editingUser && !formData.password) {
      toast.error('Password is required for new users');
      return;
    }
    
    // Retailer-specific validation
    if (formData.role === 'retailer') {
      if (!formData.area || !formData.city || !formData.state) {
        toast.error('Area, City and State are required for retailers');
        return;
      }
      if (formData.shop_type === 'Others' && !formData.shop_type_remark) {
        toast.error('Please provide remark for "Others" shop type');
        return;
      }
    }
    
    // Field Team validation
    if (formData.role === 'field_team') {
      if (!formData.contact || !formData.address || !formData.city) {
        toast.error('Contact, Address and City are required for Field Team');
        return;
      }
    }

    try {
      // Clean up form data - remove empty strings for optional numeric fields
      const cleanFormData = { ...formData };
      
      // Convert empty strings to null for optional numeric fields
      if (cleanFormData.latitude === '' || cleanFormData.latitude === null) {
        delete cleanFormData.latitude;
      } else if (cleanFormData.latitude) {
        cleanFormData.latitude = parseFloat(cleanFormData.latitude);
      }
      
      if (cleanFormData.longitude === '' || cleanFormData.longitude === null) {
        delete cleanFormData.longitude;
      } else if (cleanFormData.longitude) {
        cleanFormData.longitude = parseFloat(cleanFormData.longitude);
      }
      
      // Remove empty optional string fields for cleaner data
      ['zone', 'category', 'shop_type', 'shop_type_remark', 'assigned_to'].forEach(field => {
        if (!cleanFormData[field]) {
          delete cleanFormData[field];
        }
      });
      
      if (editingUser) {
        // Update existing user
        if (!cleanFormData.password) {
          delete cleanFormData.password; // Don't send empty password
        }
        await api.put(`/api/users/${editingUser.id}`, cleanFormData);
        toast.success('User updated successfully');
      } else {
        // Create new user
        await api.post('/api/users', cleanFormData);
        toast.success('User created successfully');
      }
      
      setShowModal(false);
      resetForm();
      loadUsers();
    } catch (error) {
      console.error('Failed to save user:', error);
      // Handle Pydantic validation errors (array of objects)
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail)) {
        // Extract first error message
        const firstError = detail[0];
        const errorMsg = firstError?.msg || firstError?.message || 'Validation error';
        const field = firstError?.loc?.slice(-1)[0] || '';
        toast.error(field ? `${field}: ${errorMsg}` : errorMsg);
      } else if (typeof detail === 'string') {
        toast.error(detail);
      } else {
        toast.error('Failed to save user');
      }
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'staff',
      contact: user.contact || '',
      company_name: user.company_name || '',
      address: user.address || '',
      city: user.city || '',
      // Retailer-specific fields
      area: user.area || '',
      state: user.state || '',
      zone: user.zone || '',
      latitude: user.latitude || '',
      longitude: user.longitude || '',
      category: user.category || '',
      shop_type: user.shop_type || '',
      shop_type_remark: user.shop_type_remark || '',
      assigned_to: user.assigned_to || '',
      commission_percentage: user.commission_percentage || 0,
      upfront_collection_percentage: user.upfront_collection_percentage ?? 50,
      model_changed_at: user.model_changed_at || '',
      status: user.status || 'active'
    });
    setShowModal(true);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await api.delete(`/api/users/${userId}`);
      toast.success('User deleted successfully');
      loadUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error('Failed to delete user');
    }
  };

  const resetForm = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'staff',
      contact: '',
      company_name: '',
      address: '',
      city: '',
      // Retailer-specific fields
      area: '',
      state: '',
      zone: '',
      latitude: '',
      longitude: '',
      category: '',
      shop_type: '',
      shop_type_remark: '',
      assigned_to: '',
      commission_percentage: 0,
      upfront_collection_percentage: 50,
      model_changed_at: '',
      status: 'active'
    });
    setShowPassword(false);
  };
  
  const toggleRowExpanded = (userId) => {
    setExpandedRows(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };
  
  // Get assigned user name by ID
  const getAssignedUserName = (assignedToId) => {
    if (!assignedToId) return '-';
    const user = assignableUsers.find(u => u.id === assignedToId);
    return user ? `${user.name} (${user.role === 'field_team' ? 'Field Team' : 'Staff'})` : assignedToId;
  };

  const openNewUserModal = () => {
    resetForm();
    setShowModal(true);
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.company_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  // Count by role
  const roleCounts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    staff: users.filter(u => u.role === 'staff').length,
    retailer: users.filter(u => u.role === 'retailer').length,
    field_team: users.filter(u => u.role === 'field_team').length
  };

  return (
    <Layout title="User Management">
      <div data-testid="user-management-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-500">
              Manage admin, staff, and retailer accounts
            </p>
          </div>
          <Button 
            onClick={openNewUserModal}
            className="bg-[#14532D] hover:bg-[#166534]"
            data-testid="add-user-btn"
          >
            <Plus size={16} className="mr-1" /> Add User
          </Button>
        </div>

        {/* Role Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {['all', 'admin', 'staff', 'retailer', 'field_team'].map(role => (
            <Button
              key={role}
              variant={filterRole === role ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterRole(role)}
              className={filterRole === role ? 'bg-[#14532D]' : ''}
            >
              {role === 'all' ? 'All Users' : ROLE_CONFIG[role]?.label || role}
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/20 text-xs">
                {roleCounts[role]}
              </span>
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by name, email, or company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 max-w-md"
            data-testid="search-users"
          />
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 text-left font-medium text-gray-500">USER</th>
                    <th className="p-3 text-left font-medium text-gray-500">EMAIL</th>
                    <th className="p-3 text-left font-medium text-gray-500">ROLE</th>
                    <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                    <th className="p-3 text-left font-medium text-gray-500">CONTACT</th>
                    <th className="p-3 text-left font-medium text-gray-500">COMPANY/CITY</th>
                    <th className="p-3 text-center font-medium text-gray-500">COMMISSION</th>
                    <th className="p-3 text-center font-medium text-gray-500">UPFRONT %</th>
                    <th className="p-3 text-center font-medium text-gray-500">REFERRAL</th>
                    <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-gray-400">
                        Loading users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-gray-400">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.staff;
                      const RoleIcon = roleConfig.icon;
                      
                      return (
                        <React.Fragment key={user.id}>
                        <tr className="border-b hover:bg-gray-50" data-testid={`user-row-${user.id}`}>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-[#14532D] flex items-center justify-center text-white text-xs font-medium">
                                {user.name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <span className="font-medium">{user.name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-gray-600">{user.email}</td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${roleConfig.color}`}>
                              <RoleIcon size={12} />
                              {roleConfig.label}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {user.role === 'retailer' ? (
                              <span className={`px-2 py-1 rounded text-xs font-medium ${user.status === 'churned' ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                                {user.status === 'churned' ? 'Churned' : 'Active'}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-gray-600">{user.contact || '-'}</td>
                          <td className="p-3 text-gray-600">
                            {user.role === 'field_team' 
                              ? (user.city ? `${user.city}` : '-')
                              : (user.company_name || '-')
                            }
                          </td>
                          <td className="p-3 text-center">
                            {user.role === 'retailer' ? (
                              <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                                {user.commission_percentage || 0}%
                              </span>
                            ) : user.role === 'field_team' ? '' : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {user.role === 'retailer' ? (
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                user.upfront_collection_percentage === 100 
                                  ? 'bg-purple-100 text-purple-700' 
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {user.upfront_collection_percentage ?? 50}%
                              </span>
                            ) : user.role === 'field_team' ? '' : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {user.role === 'retailer' && user.referral_code ? (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-mono font-bold">
                                {user.referral_code}
                              </span>
                            ) : user.role === 'retailer' ? (
                              <span className="text-gray-400 text-xs">Not set</span>
                            ) : user.role === 'field_team' ? '' : '-'}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1">
                              {/* Expand button for retailers */}
                              {user.role === 'retailer' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleRowExpanded(user.id)}
                                  className="h-8 w-8 p-0"
                                  data-testid={`expand-user-${user.id}`}
                                >
                                  {expandedRows[user.id] ? (
                                    <ChevronUp size={14} className="text-gray-600" />
                                  ) : (
                                    <ChevronDown size={14} className="text-gray-600" />
                                  )}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(user)}
                                className="h-8 w-8 p-0"
                                data-testid={`edit-user-${user.id}`}
                              >
                                <Edit size={14} className="text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(user.id)}
                                className="h-8 w-8 p-0"
                                data-testid={`delete-user-${user.id}`}
                              >
                                <Trash2 size={14} className="text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        
                        {/* Expanded row details for retailers */}
                        {user.role === 'retailer' && expandedRows[user.id] && (
                          <tr className="bg-gray-50 border-b">
                            <td colSpan="11" className="p-4">
                              <div className="grid grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-500 block text-xs">Address</span>
                                  <span className="font-medium">{user.address || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block text-xs">Area</span>
                                  <span className="font-medium">{user.area || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block text-xs">City</span>
                                  <span className="font-medium">{user.city || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block text-xs">State</span>
                                  <span className="font-medium">{user.state || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block text-xs">Zone</span>
                                  <span className="font-medium">{user.zone || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block text-xs">Shop Type</span>
                                  <span className="font-medium">
                                    {user.shop_type || '-'}
                                    {user.shop_type === 'Others' && user.shop_type_remark && (
                                      <span className="text-gray-500 text-xs ml-1">({user.shop_type_remark})</span>
                                    )}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block text-xs">Category</span>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                    user.category === 'Platinum' ? 'bg-purple-100 text-purple-700' :
                                    user.category === 'Gold' ? 'bg-yellow-100 text-yellow-700' :
                                    user.category === 'Silver' ? 'bg-gray-200 text-gray-700' :
                                    user.category === 'Bronze' ? 'bg-orange-100 text-orange-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {user.category || 'Not set'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block text-xs">Assigned To</span>
                                  <span className="font-medium">{getAssignedUserName(user.assigned_to)}</span>
                                </div>
                                {(user.latitude || user.longitude) && (
                                  <>
                                    <div>
                                      <span className="text-gray-500 block text-xs">Latitude</span>
                                      <span className="font-medium">{user.latitude || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 block text-xs">Longitude</span>
                                      <span className="font-medium">{user.longitude || '-'}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Add/Edit User Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h3>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                {/* Role Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <div className="flex flex-wrap gap-2">
                    {['admin', 'staff', 'retailer', 'field_team'].map(role => {
                      const config = ROLE_CONFIG[role];
                      const RoleIcon = config.icon;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, role }))}
                          className={`flex-1 min-w-[100px] flex items-center justify-center gap-1 px-3 py-2 rounded-lg border-2 transition-colors ${
                            formData.role === role 
                              ? 'border-[#14532D] bg-green-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <RoleIcon size={14} />
                          <span className="text-sm font-medium">{config.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter full name"
                    required
                    data-testid="user-name-input"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="email@example.com"
                      className="pl-9"
                      required
                      data-testid="user-email-input"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password {editingUser ? '(leave blank to keep current)' : '*'}
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={editingUser ? '••••••••' : 'Enter password'}
                      required={!editingUser}
                      data-testid="user-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Contact (hide for field_team - they have specific fields below) */}
                {formData.role !== 'field_team' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input
                        type="tel"
                        value={formData.contact}
                        onChange={(e) => setFormData(prev => ({ ...prev, contact: e.target.value }))}
                        placeholder="Phone number"
                        className="pl-9"
                        data-testid="user-contact-input"
                      />
                    </div>
                  </div>
                )}

                {/* Company Name (show for retailer) */}
                {formData.role === 'retailer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company/Shop Name</label>
                    <Input
                      value={formData.company_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                      placeholder="Enter company or shop name"
                      data-testid="user-company-input"
                    />
                  </div>
                )}

                {/* Address (show for retailer) */}
                {formData.role === 'retailer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="Enter address"
                      data-testid="user-address-input"
                    />
                  </div>
                )}

                {/* Retailer Location Fields */}
                {formData.role === 'retailer' && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Area *</label>
                        <Input
                          value={formData.area}
                          onChange={(e) => setFormData(prev => ({ ...prev, area: e.target.value }))}
                          placeholder="Area/Locality"
                          data-testid="retailer-area-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                        <Input
                          value={formData.city}
                          onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                          placeholder="City"
                          data-testid="retailer-city-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                        <Input
                          value={formData.state}
                          onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                          placeholder="State"
                          data-testid="retailer-state-input"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
                        <Input
                          value={formData.zone}
                          onChange={(e) => setFormData(prev => ({ ...prev, zone: e.target.value }))}
                          placeholder="Custom zone (optional)"
                          data-testid="retailer-zone-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                        <Input
                          type="number"
                          step="any"
                          value={formData.latitude}
                          onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                          placeholder="Latitude"
                          data-testid="retailer-lat-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                        <Input
                          type="number"
                          step="any"
                          value={formData.longitude}
                          onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                          placeholder="Longitude"
                          data-testid="retailer-lng-input"
                        />
                      </div>
                    </div>
                    
                    {/* Shop Type and Category */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Shop Type</label>
                        <select
                          value={formData.shop_type}
                          onChange={(e) => setFormData(prev => ({ ...prev, shop_type: e.target.value, shop_type_remark: e.target.value !== 'Others' ? '' : prev.shop_type_remark }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          data-testid="retailer-shop-type-select"
                        >
                          <option value="">Select Shop Type</option>
                          <option value="Fruit Shop">Fruit Shop</option>
                          <option value="Vegetable Shop">Vegetable Shop</option>
                          <option value="Supermarket">Supermarket</option>
                          <option value="Grocery Shop">Grocery Shop</option>
                          <option value="Others">Others</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                          value={formData.category}
                          onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          data-testid="retailer-category-select"
                        >
                          <option value="">Select Category</option>
                          <option value="Platinum">Platinum</option>
                          <option value="Gold">Gold</option>
                          <option value="Silver">Silver</option>
                          <option value="Bronze">Bronze</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Shop Type Remark (required if Others) */}
                    {formData.shop_type === 'Others' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Shop Type Remark *</label>
                        <Input
                          value={formData.shop_type_remark}
                          onChange={(e) => setFormData(prev => ({ ...prev, shop_type_remark: e.target.value }))}
                          placeholder="Please specify the shop type"
                          data-testid="retailer-shop-remark-input"
                        />
                      </div>
                    )}
                    
                    {/* Assigned To */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                      <select
                        value={formData.assigned_to}
                        onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        data-testid="retailer-assigned-to-select"
                      >
                        <option value="">Select Staff/Field Team</option>
                        {assignableUsers.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role === 'field_team' ? 'Field Team' : 'Staff'}{u.city ? ` - ${u.city}` : ''})
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Field Team specific fields */}
                {formData.role === 'field_team' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                      <div className="relative">
                        <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <Input
                          type="tel"
                          value={formData.contact}
                          onChange={(e) => setFormData(prev => ({ ...prev, contact: e.target.value }))}
                          placeholder="Enter contact number"
                          className="pl-9"
                          data-testid="field-team-contact-input"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                      <Input
                        value={formData.address}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Enter full address"
                        data-testid="field-team-address-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                      <Input
                        value={formData.city}
                        onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                        placeholder="Enter city"
                        data-testid="field-team-city-input"
                      />
                    </div>
                  </>
                )}

                {/* Commission Percentage (show for retailer) */}
                {formData.role === 'retailer' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Commission %</label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={formData.commission_percentage}
                          onChange={(e) => setFormData(prev => ({ ...prev, commission_percentage: parseFloat(e.target.value) || 0 }))}
                          placeholder="e.g., 20"
                          data-testid="user-commission-input"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Retailer pays {100 - (formData.commission_percentage || 0)}% of MRP
                      </p>
                      {editingUser && (
                        <p className="text-[10px] text-orange-600 mt-1">
                          ⚠️ Changing this will record the new rate from today. Historical dispatches keep their existing rate.
                        </p>
                      )}
                    </div>
                    
                    {/* Commission History (read-only, only when editing) */}
                    {editingUser && editingUser.commission_history && editingUser.commission_history.length > 0 && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Commission History</label>
                        <div className="bg-gray-50 p-2 rounded border text-xs space-y-1 max-h-24 overflow-y-auto">
                          {editingUser.commission_history.map((h, idx) => (
                            <div key={idx} className="flex justify-between text-gray-600">
                              <span>{h.rate}%</span>
                              <span>{h.effective_from} to {h.effective_to || 'Present'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Status field for retailers */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm"
                        data-testid="user-status-select"
                      >
                        <option value="active">Active</option>
                        <option value="churned">Churned</option>
                      </select>
                      {formData.status === 'churned' && (
                        <p className="text-[10px] text-red-600 mt-1">
                          Churned retailers will not appear in dropdowns for new indents/dispatches
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Upfront Collection %</label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="10"
                          value={formData.upfront_collection_percentage}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value) || 50;
                            setFormData(prev => {
                              // Auto-fill model_changed_at with today's date if switching to 100% and field is empty
                              const shouldAutoFillDate = newValue === 100 && !prev.model_changed_at;
                              const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
                              return {
                                ...prev,
                                upfront_collection_percentage: newValue,
                                model_changed_at: shouldAutoFillDate ? todayDate : prev.model_changed_at
                              };
                            });
                          }}
                          placeholder="e.g., 50"
                          data-testid="user-upfront-input"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {formData.upfront_collection_percentage === 100 
                          ? '100% upfront = Auto Credit Notes on rejections' 
                          : `Collect ${formData.upfront_collection_percentage}% upfront, ${100 - (formData.upfront_collection_percentage || 50)}% on delivery`}
                      </p>
                    </div>
                    
                    {/* Model Changed At - Only show for 100% upfront retailers */}
                    {formData.upfront_collection_percentage === 100 && (
                      <div>
                        <Label className="text-xs text-gray-600">100% Upfront Effective From</Label>
                        <Input
                          type="date"
                          value={formData.model_changed_at || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, model_changed_at: e.target.value }))}
                          placeholder="YYYY-MM-DD"
                          data-testid="user-model-changed-at-input"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">
                          Rejections before this date use 50% rule (reduce invoice). After this date, rejections create credit notes.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowModal(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-[#14532D] hover:bg-[#166534]"
                    data-testid="save-user-btn"
                  >
                    {editingUser ? 'Update User' : 'Create User'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
