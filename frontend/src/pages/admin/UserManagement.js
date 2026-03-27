import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  Users, Plus, Edit, Trash2, Shield, UserCheck, Store, 
  Search, Eye, EyeOff, Mail, Phone, X
} from 'lucide-react';

const ROLE_CONFIG = {
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700', icon: Shield },
  staff: { label: 'Staff', color: 'bg-blue-100 text-blue-700', icon: UserCheck },
  retailer: { label: 'Retailer', color: 'bg-green-100 text-green-700', icon: Store }
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
    address: ''
  });

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

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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

    try {
      if (editingUser) {
        // Update existing user
        const updateData = { ...formData };
        if (!updateData.password) {
          delete updateData.password; // Don't send empty password
        }
        await api.put(`/api/users/${editingUser.id}`, updateData);
        toast.success('User updated successfully');
      } else {
        // Create new user
        await api.post('/api/users', formData);
        toast.success('User created successfully');
      }
      
      setShowModal(false);
      resetForm();
      loadUsers();
    } catch (error) {
      console.error('Failed to save user:', error);
      toast.error(error.response?.data?.detail || 'Failed to save user');
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
      address: user.address || ''
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
      address: ''
    });
    setShowPassword(false);
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
    retailer: users.filter(u => u.role === 'retailer').length
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
          {['all', 'admin', 'staff', 'retailer'].map(role => (
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
                    <th className="p-3 text-left font-medium text-gray-500">CONTACT</th>
                    <th className="p-3 text-left font-medium text-gray-500">COMPANY</th>
                    <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400">
                        Loading users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.staff;
                      const RoleIcon = roleConfig.icon;
                      
                      return (
                        <tr key={user.id} className="border-b hover:bg-gray-50" data-testid={`user-row-${user.id}`}>
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
                          <td className="p-3 text-gray-600">{user.contact || '-'}</td>
                          <td className="p-3 text-gray-600">{user.company_name || '-'}</td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1">
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
                  <div className="flex gap-2">
                    {['admin', 'staff', 'retailer'].map(role => {
                      const config = ROLE_CONFIG[role];
                      const RoleIcon = config.icon;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, role }))}
                          className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border-2 transition-colors ${
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

                {/* Contact */}
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
