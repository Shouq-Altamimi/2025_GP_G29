"use client";

import React, { useState, useEffect } from "react";
import {
  Pill,
  Stethoscope,
  Truck,
  User,
  Shield,
  Zap,
  Globe,
  Crown,
  GraduationCap,
  Users,
} from "lucide-react";

const C = {
  primary: "#B08CC1",
  teal: "#52B9C4",
  ink: "#4A2C59",
  bg: "#F7F8FC",
};

export default function Welcome() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeRole, setActiveRole] = useState(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const roles = [
    {
      id: "doctor",
      icon: <Stethoscope className="w-5 h-5 text-[#4A2C59]" />,
      title: "Doctor",
      description: "Issues digital prescriptions with precision and security.",
      bgColor: "bg-gradient-to-br from-[#F4EDF9] to-[#E8DEF8]",
      delay: "100ms",
    },
    {
      id: "pharmacy",
      icon: <Pill className="w-5 h-5 text-[#B08CC1]" />,
      title: "Pharmacy",
      description: "Verifies and dispenses with complete traceability.",
      bgColor: "bg-gradient-to-br from-[#F4EDF9] to-[#F0E8F5]",
      delay: "200ms",
    },
    {
      id: "logistics",
      icon: <Truck className="w-5 h-5 text-[#52B9C4]" />,
      title: "Logistics",
      description: "Ensures secure, temperature-controlled delivery.",
      bgColor: "bg-gradient-to-br from-[#F0FAFB] to-[#E6F7F9]",
      delay: "300ms",
    },
    {
      id: "patient",
      icon: <User className="w-5 h-5 text-[#4A2C59]" />,
      title: "Patient",
      description:
        "Receives verified medication with a clear, traceable journey.",
      bgColor: "bg-gradient-to-br from-[#FDF3F8] to-[#FBECF4]",
      delay: "400ms",
    },
  ];

  const features = [
    { icon: <Shield className="w-5 h-5" />, text: "End-to-End Security" },
    { icon: <Zap className="w-5 h-5" />, text: "Real-Time Tracking" },
    { icon: <Globe className="w-5 h-5" />, text: "Seamless Integration" },
    { icon: <Crown className="w-5 h-5" />, text: "Reliable Experience" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="w-full bg-white/80 backdrop-blur-xl border-b border-[#E6E7F0]/50 h-20 flex items-center px-8 relative z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <img
              src="/Images/TrustDose_logo.png"
              alt="TrustDose Logo"
              className="w-40 h-40 object-contain"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#B08CC1] to-[#52B9C4] text-white font-semibold shadow hover:shadow-md transition-all"
            onClick={() => (window.location.href = "/auth")}
          >
            Join TrustDose
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative z-10">
        
        <section className="w-full bg-gradient-to-b from-[#F1E4FF] via-[#F7F0FF] to-[#FCFAFF] relative">
          <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-12 space-y-10">
            {/* Hero */}
            <section className="text-center space-y-6">
              <div
                className={`space-y-4 transition-all duration-700 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
              >
                <h1 className="text-3xl md:text-4xl font-black text-transparent leading-tight animate-gradient glow-text"
                  style={{
                    backgroundImage: "linear-gradient(to right, #6A2C91, #B08CC1, #66D1D3)",
                    backgroundSize: "220% 220%",
                    backgroundClip: "text",
                    WebkitBackgroundClip: "text",
                  }}> Welcome to TrustDose
                </h1>

                <p className="text-base md:text-lg text-[#4A2C59]/80 font-light max-w-2xl mx-auto leading-relaxed">
                  Trust in Every Dose, Every Delivery.
                </p>
              </div>


              <div
                className={`flex flex-wrap justify-center gap-4 mt-6 transition-all duration-700 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
              >
                {features.map((feature, index) => (
                  <div
                    key={feature.text}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 backdrop-blur-sm border border-[#E6E7F0]/70 shadow-sm"
                    style={{ transitionDelay: `${200 + index * 80}ms` }}
                  >
                    <div className="text-[#B08CC1]">{feature.icon}</div>
                    <span className="text-xs md:text-sm font-medium text-[#4A2C59]">
                      {feature.text}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            
            <section
              className={`text-center space-y-3 transition-all duration-700 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
            >
              <div className="inline-flex items-center gap-2 text-[#52B9C4]">
                <Users className="w-5 h-5" />
                <span className="text-xs md:text-sm font-semibold uppercase tracking-wider">
                  Integrated Ecosystem
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#4A2C59]">
                Four Stakeholders, One Vision
              </h2>
              <p className="text-sm md:text-base text-[#4A2C59]/70 max-w-2xl mx-auto">
                A seamless workflow connecting every participant in the
                prescription lifecycle.
              </p>
            </section>
          </div>

          <div className="w-full -mb-1">
            <svg
              viewBox="0 0 1440 150"
              preserveAspectRatio="none"
              className="w-full h-[80px]"
            >
              <path
                fill="#FFFFFF"
                d="M0,64L80,74.7C160,85,320,107,480,117.3C640,128,800,128,960,117.3C1120,107,1280,85,1360,74.7L1440,64L1440,150L1360,150C1280,150,1120,150,960,150C800,150,640,150,480,150C320,150,160,150,80,150L0,150Z"
              />
            </svg>
          </div>
        </section>


        <section className="w-full flex justify-center px-6 py-12 bg-white">
          <div className="w-full max-w-6xl space-y-12">
            <section
              className={`space-y-8 transition-all duration-700 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className={`group relative p-6 rounded-3xl bg-white/80 backdrop-blur-sm border border-[#E6E7F0]/50 shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105 cursor-pointer ${
                      activeRole === role.id
                        ? "ring-2 ring-[#B08CC1] bg-white"
                        : ""
                    }`}
                    style={{ transitionDelay: role.delay }}
                    onMouseEnter={() => setActiveRole(role.id)}
                    onMouseLeave={() => setActiveRole(null)}
                  >
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#B08CC1]/5 to-[#52B9C4]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative z-10 space-y-4">
                      <div
                        className={`w-14 h-14 rounded-2xl ${role.bgColor} flex items-center justify-center shadow-md group-hover:shadow-lg transition-all duration-300 transform group-hover:scale-110`}
                      >
                        {role.icon}
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-base md:text-lg font-bold text-[#4A2C59]">
                          {role.title}
                        </h3>
                        <p className="text-xs md:text-sm text-[#4A2C59]/70 leading-relaxed font-medium">
                          {role.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            
            <section
              className={`space-y-8 transition-all duration-700 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
            >
              
              <div className="group relative p-8 rounded-3xl bg-gradient-to-br from-[#FCFAFE] to-[#F7F3FD] border border-[#D9C7E9] shadow-md hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.015]">
                <div className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-gradient-to-br from-[#B08CC1]/10 to-[#52B9C4]/10 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-[#4A2C59]" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-xl md:text-2xl font-bold text-[#4A2C59]">
                    Our Vision
                  </h3>
                  <p className="text-sm md:text-base text-[#4A2C59]/80 leading-relaxed font-medium">
                  "To revolutionize medication safety by creating a secure, transparent, 
                    and intelligent digital ecosystem
                   that ensures every prescription is trusted and safely delivered, 
                    supporting Saudi Arabia’s Vision 2030 
                    in advancing innovative,technology-driven healthcare 
                    transforming patient protection and confidence, dose by dose"
                  </p>
                </div>
              </div>

              <div className="group relative p-8 rounded-3xl bg-gradient-to-br from-[#FCFAFE] to-[#F7F3FD] border border-[#D9C7E9] shadow-md hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.015]">
                <div className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-gradient-to-br from-[#52B9C4]/10 to-[#B08CC1]/10 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-[#4A2C59]" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-xl md:text-2xl font-bold text-[#4A2C59]">
                    Our Goal
                  </h3>
                  <p className="text-sm md:text-base text-[#4A2C59]/80 leading-relaxed font-medium">
                  "Our goal is to redefine trust in medication by delivering a secure, transparent, and seamless journey from doctor to patient building trust, dose by dose"
                  </p>
                </div>
              </div>

              
              <div className="group relative p-8 rounded-3xl bg-gradient-to-br from-[#FCFAFE] to-[#F7F3FD] border border-[#D9C7E9] shadow-md hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.015]">
                <div className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-gradient-to-br from-[#4A2C59]/10 to-[#B08CC1]/10 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-[#4A2C59]" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-xl md:text-2xl font-bold text-[#4A2C59]">
                    Our Team
                  </h3>
                  <div className="space-y-3">
                    <p className="text-sm md:text-base text-[#4A2C59]/80 leading-relaxed font-medium">
                      A team of Information Technology students at King Saud
                      University.
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-[#B08CC1]" />
                        <span className="font-semibold text-[#4A2C59]">
                          Team Members:
                        </span>
                      </div>
                      <p className="text-xs md:text-sm text-[#4A2C59]/70 font-medium">
                        Maha, Ftoon, Shouq, Daad, AlJawhara
                      </p>
                      <div className="flex items-center gap-2 text-sm mt-3">
                        <Crown className="w-4 h-4 text-[#52B9C4]" />
                        <span className="font-semibold text-[#4A2C59]">
                          Supervised by:
                        </span>
                      </div>
                      <p className="text-xs md:text-sm text-[#4A2C59]/70 font-medium">
                        Dr. Nourah AlRossais
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
