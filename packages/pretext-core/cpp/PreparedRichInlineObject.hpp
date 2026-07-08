// PreparedRichInlineObject.hpp — Nitro HybridObject wrapping a
// pretext::PreparedRichInlinePtr.
//
// COMPILES ONLY WITHIN THE REACT NATIVE BUILD (nitrogen autolinking): it
// depends on the generated HybridPreparedRichInlineSpec + NitroModules headers,
// which are not present in this host checkout. The kernel-facing calls it makes
// are verified separately by /tmp/kernel_shim.cpp.
#pragma once

#include "HybridPreparedRichInlineSpec.hpp"
#include "pretext/types.hpp"

namespace margelo::nitro::pretextcore {

class PreparedRichInlineObject : public HybridPreparedRichInlineSpec {
 public:
  // Default constructor required by the generated autolinking static_assert.
  // Never actually invoked at runtime — instances come from
  // PretextCoreModule::prepareRichInline with a real handle.
  PreparedRichInlineObject() : HybridObject(TAG) {}

  explicit PreparedRichInlineObject(pretext::PreparedRichInlinePtr prepared)
      : HybridObject(TAG), prepared_(std::move(prepared)) {}

  RichWalkResultSpec walk(double maxWidth) override;
  LineStatsSpec stats(double maxWidth) override;

 private:
  pretext::PreparedRichInlinePtr prepared_;
};

}  // namespace margelo::nitro::pretextcore
