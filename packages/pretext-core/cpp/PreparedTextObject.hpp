// PreparedTextObject.hpp — Nitro HybridObject wrapping a pretext::PreparedPtr.
//
// COMPILES ONLY WITHIN THE REACT NATIVE BUILD (nitrogen autolinking): it
// depends on the generated HybridPreparedTextSpec + NitroModules headers, which
// are not present in this host checkout. The kernel-facing calls it makes are
// verified separately by /tmp/kernel_shim.cpp.
#pragma once

#include "HybridPreparedTextSpec.hpp"
#include "pretext/types.hpp"

namespace margelo::nitro::pretextcore {

class PreparedTextObject : public HybridPreparedTextSpec {
 public:
  // Default constructor required by the generated autolinking static_assert.
  // Never actually invoked at runtime — instances come from
  // PretextCoreModule::prepare with a real PreparedPtr.
  PreparedTextObject() : HybridObject(TAG) {}

  explicit PreparedTextObject(pretext::PreparedPtr prepared)
      : HybridObject(TAG), prepared_(std::move(prepared)) {}

  LayoutResultSpec layout(double maxWidth, double lineHeight) override;
  LayoutLinesResultSpec layoutWithLines(double maxWidth, double lineHeight) override;
  LineStatsSpec measureLineStats(double maxWidth) override;
  double naturalWidth() override;

 private:
  pretext::PreparedPtr prepared_;
};

}  // namespace margelo::nitro::pretextcore
