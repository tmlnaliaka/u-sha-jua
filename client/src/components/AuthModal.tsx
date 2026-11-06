import React, { useState, useEffect } from 'react';
import { X, User, Lock, Mail, Phone, Shield, CheckCircle2, AlertCircle, Key, LogOut } from 'lucide-react';
import { api } from '../services/api';
import { UserProfile, UserRole } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onUserChanged: (user: UserProfile | null) => void;
  showToast: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChanged,
  showToast,
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'profile'>(
    currentUser ? 'profile' : 'login'
  );

  useEffect(() => {
    if (currentUser) {
      setMode('profile');
    } else if (mode === 'profile') {
      setMode('login');
    }
  }, [currentUser, isOpen]);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Signup form state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupRole, setSignupRole] = useState<UserRole>('dispatcher');

  // Forgot / Reset password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'submit'>('request');

  // Profile edit state
  const [editName, setEditName] = useState(currentUser?.full_name || '');
  const [editPhone, setEditPhone] = useState(currentUser?.phone || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setEditName(currentUser.full_name);
      setEditPhone(currentUser.phone || '');
    }
  }, [currentUser]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const session = await api.login(loginIdentifier, loginPassword);
      onUserChanged(session.user);
      showToast(`Welcome back, ${session.user.full_name} (${session.user.role.toUpperCase()})`);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const newUser = await api.signup({
        email: signupEmail,
        phone: signupPhone || undefined,
        password: signupPassword,
        full_name: signupName,
        role: signupRole,
      });
      showToast(`Account created for ${newUser.full_name}. Logging in...`);
      // Auto login
      const session = await api.login(signupEmail, signupPassword);
      onUserChanged(session.user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Check inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await api.forgotPassword(resetEmail);
      if (res.simulated_reset_token) {
        setResetToken(res.simulated_reset_token);
      }
      setResetStep('submit');
      showToast('Reset token issued. Enter your new password.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to request reset token.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await api.resetPassword(resetToken, newPassword);
      showToast('Password updated successfully. You can now log in.');
      setMode('login');
      setResetStep('request');
      setLoginIdentifier(resetEmail);
      setLoginPassword(newPassword);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    try {
      await api.logout();
      onUserChanged(null);
      showToast('Signed out successfully.');
      onClose();
    } catch (err: any) {
      api.clearSession();
      onUserChanged(null);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMessage(null);
    setIsUpdatingProfile(true);
    try {
      const updated = await api.updateUserProfile(currentUser.id, {
        full_name: editName,
        phone: editPhone || undefined,
      });
      onUserChanged(updated);
      showToast('Profile updated successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-base font-bold text-white font-mono">
                {currentUser ? 'Command Identity Profile' : 'Access & Authentication'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {currentUser ? 'Verified cryptographic session' : 'JWT & RBAC Security Layer'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs (if logged out) */}
        {!currentUser && (
          <div className="flex border-b border-white/10 bg-slate-950/40 text-xs font-semibold">
            <button
              onClick={() => { setMode('login'); setErrorMessage(null); }}
              className={`flex-1 py-3 text-center border-b-2 transition ${
                mode === 'login'
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setErrorMessage(null); }}
              className={`flex-1 py-3 text-center border-b-2 transition ${
                mode === 'signup'
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
            {mode === 'forgot' && (
              <button
                className="flex-1 py-3 text-center border-b-2 border-amber-500 text-amber-400 bg-amber-500/5"
              >
                Reset Password
              </button>
            )}
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Body Contents */}
        <div className="p-6">
          {/* PROFILE VIEW */}
          {currentUser && mode === 'profile' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-800/60 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-400/40 flex items-center justify-center font-bold text-blue-300 text-sm">
                      {currentUser.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{currentUser.full_name}</h3>
                      <p className="text-xs text-slate-400 font-mono">{currentUser.email}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                    currentUser.role === 'admin'
                      ? 'bg-purple-950/80 text-purple-300 border-purple-500/40'
                      : currentUser.role === 'dispatcher'
                      ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                      : currentUser.role === 'responder'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                      : 'bg-blue-950/80 text-blue-300 border-blue-500/40'
                  }`}>
                    {currentUser.role}
                  </span>
                </div>

                <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>
                    <span className="text-slate-500 block">Status:</span>
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" /> Active & Verified
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">User ID:</span>
                    <span className="font-mono text-slate-300 truncate block" title={currentUser.id}>
                      {currentUser.id.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </div>

              {/* Edit self profile form */}
              <form onSubmit={handleUpdateProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Update Full Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Update Phone</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+254700000000"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition"
                  >
                    {isUpdatingProfile ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isSubmitting}
                    className="flex items-center justify-center space-x-1.5 py-2 px-4 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs font-semibold transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* SIGN IN FORM */}
          {!currentUser && mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email or Phone Number</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="officer@ushajua.org or +254..."
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setErrorMessage(null); }}
                    className="text-[11px] text-blue-400 hover:text-blue-300"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-98 disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-blue-900/40"
              >
                {isSubmitting ? 'Authenticating...' : 'Sign In to Command Console'}
              </button>

              <div className="text-center">
                <span className="text-[11px] text-slate-500">Need an operational account? </span>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setErrorMessage(null); }}
                  className="text-[11px] text-blue-400 font-semibold hover:underline"
                >
                  Register here
                </button>
              </div>
            </form>
          )}

          {/* SIGN UP FORM */}
          {!currentUser && mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Legal / Callsign Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="Dispatcher Sarah Kimani"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    placeholder="sarah.k@ushajua.org"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Phone Number (Optional)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    placeholder="+254712345678"
                    value={signupPhone}
                    onChange={(e) => setSignupPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Operational Role</label>
                <select
                  value={signupRole}
                  onChange={(e) => setSignupRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="citizen">Civilian Citizen (Distress Reporting & Tracking)</option>
                  <option value="responder">Tactical First Responder (Field Units)</option>
                  <option value="dispatcher">Emergency Dispatcher (Incident Command)</option>
                  <option value="admin">System Administrator (Full Oversight)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password (min 8 characters)</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-98 disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-blue-900/40"
              >
                {isSubmitting ? 'Registering...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* FORGOT / RESET PASSWORD */}
          {!currentUser && mode === 'forgot' && (
            <div className="space-y-4">
              {resetStep === 'request' ? (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <p className="text-xs text-slate-400">
                    Enter the email associated with your account. A password reset token will be generated.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Account Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        placeholder="officer@ushajua.org"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition"
                    >
                      {isSubmitting ? 'Requesting...' : 'Generate Reset Token'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSubmitReset} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Reset Token</label>
                    <div className="relative">
                      <Key className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">New Password (min 6 chars)</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <div className="flex space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setResetStep('request')}
                      className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                    >
                      {isSubmitting ? 'Updating...' : 'Set New Password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
