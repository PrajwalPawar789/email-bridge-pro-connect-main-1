
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Send, Settings, Shield } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <Mail className="h-8 w-8 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">EmailBridge Pro</h1>
            </div>
            <Link to="/auth">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Professional Email Campaign Management
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Connect your Hostinger email accounts, create powerful campaigns, and manage your mailbox - all in one professional platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="text-lg px-8 py-3">
                Start Free Trial
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="text-lg px-8 py-3">
              Watch Demo
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <Card>
            <CardHeader>
              <Send className="h-8 w-8 text-blue-600 mb-2" />
              <CardTitle>Campaign Management</CardTitle>
              <CardDescription>
                Create, schedule, and send professional email campaigns with advanced tracking and analytics.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Mail className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Mailbox Integration</CardTitle>
              <CardDescription>
                Access your Hostinger email inbox, sent items, and folders directly from our platform.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 text-purple-600 mb-2" />
              <CardTitle>Secure & Reliable</CardTitle>
              <CardDescription>
                Enterprise-grade security with encrypted credential storage and GDPR compliance.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to transform your email marketing?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of businesses already using EmailBridge Pro to grow their audience.
          </p>
          <Link to="/auth">
            <Button size="lg" className="text-lg px-12 py-4">
              Get Started Now
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Mail className="h-6 w-6" />
            <span className="text-lg font-semibold">EmailBridge Pro</span>
          </div>
          <p className="text-gray-400">
            Professional email campaign management made simple.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
